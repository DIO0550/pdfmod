//! オブジェクトストリーム（ObjStm）の解析と内部オブジェクト抽出（ISO 32000-1 §7.5.7）。

pub mod error;
pub mod key;
pub mod metadata;
pub mod offset;
pub mod offset_table;

#[cfg(test)]
mod tests;

use crate::byte_offset::ByteOffset;
use crate::filter::flate::decode_zlib;
use crate::filter::predictor::{decode_predictor, PredictorParams};
use crate::lexer::outcome::LexOutcome;
use crate::lexer::token::Token;
use crate::lexer::token_kind::TokenKind;
use crate::lexer::Lexer;
use crate::object::dictionary::PdfDictionary;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_id::ObjectId;
use crate::object::object_kind::ObjectKind;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::object::stream::PdfStream;
use crate::object_stream::error::{ObjectStreamError, ObjectStreamErrorKind};
use crate::object_stream::key::ObjectStreamKey;
use crate::object_stream::metadata::ObjectStreamMetadata;
use crate::object_stream::offset::ObjectStreamOffset;
use crate::object_stream::offset_table::OffsetTable;
use crate::parser::error::ParseErrorKind;
use crate::parser::Parser;

/// 解析済みオブジェクトストリーム（ISO 32000-1 §7.5.7）。
#[derive(Debug, Clone)]
pub struct ObjectStream {
    metadata: ObjectStreamMetadata,
    offset_table: OffsetTable,
    data: Vec<u8>,
    start_offset: ByteOffset,
}

impl ObjectStream {
    /// 入力バイト列中の指定オフセットにあるオブジェクトストリームを解析する。
    pub fn parse(input: &[u8], offset: ByteOffset) -> Result<Self, ObjectStreamError> {
        let usize_offset = usize::try_from(offset.value()).map_err(|_| {
            ObjectStreamError::new(ObjectStreamErrorKind::NotAnObjectStream, offset)
        })?;
        if usize_offset > input.len() {
            return Err(ObjectStreamError::new(
                ObjectStreamErrorKind::NotAnObjectStream,
                offset,
            ));
        }

        let mut parser = Parser::new_at(input, usize_offset);
        let indirect = parser.parse_indirect_object().map_err(|e| {
            ObjectStreamError::new(
                ObjectStreamErrorKind::ObjectParseFailed { kind: e.kind },
                offset,
            )
        })?;

        let (_, body) = indirect.into_parts();
        let stream = match body {
            PdfObject::Stream(s) => s,
            _ => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::NotAnObjectStream,
                    offset,
                ))
            }
        };

        Self::from_stream_internal(stream, offset)
    }

    /// 既にパース済みの [`PdfStream`] からオブジェクトストリームを構築する。
    pub fn from_stream(stream: PdfStream, offset: ByteOffset) -> Result<Self, ObjectStreamError> {
        Self::from_stream_internal(stream, offset)
    }

    fn from_stream_internal(
        stream: PdfStream,
        offset: ByteOffset,
    ) -> Result<Self, ObjectStreamError> {
        let (dict, raw_data) = stream.into_parts();

        // 1. 辞書メタデータの検証・抽出
        let metadata = ObjectStreamMetadata::from_dictionary(&dict, offset)?;

        // 2. /Filter, /DecodeParms による復号
        let data = Self::decode_stream_data(raw_data, &dict, offset)?;

        // 3. /First 境界チェック
        if metadata.first() > data.len() {
            return Err(ObjectStreamError::new(
                ObjectStreamErrorKind::FirstOutOfBounds {
                    first: metadata.first(),
                    data_len: data.len(),
                },
                offset,
            ));
        }

        // 4. オフセットテーブルの解析
        let header_bytes = &data[..metadata.first()];
        let offset_table = OffsetTable::parse(
            header_bytes,
            metadata.n(),
            metadata.first(),
            data.len(),
            offset,
        )?;

        Ok(Self {
            metadata,
            offset_table,
            data,
            start_offset: offset,
        })
    }

    /// 格納されているオブジェクト数（`/N`）を取得する。
    #[inline]
    #[must_use]
    pub const fn n(&self) -> usize {
        self.metadata.n()
    }

    /// データ領域開始バイトオフセット（`/First`）を取得する。
    #[inline]
    #[must_use]
    pub const fn first(&self) -> usize {
        self.metadata.first()
    }

    /// 拡張元ストリームへの間接参照（`/Extends`）を取得する。
    #[inline]
    #[must_use]
    pub const fn extends(&self) -> Option<ObjectId> {
        self.metadata.extends()
    }

    /// メタデータへの参照を取得する。
    #[inline]
    #[must_use]
    pub const fn metadata(&self) -> &ObjectStreamMetadata {
        &self.metadata
    }

    /// オフセットテーブルへの参照を取得する。
    #[inline]
    #[must_use]
    pub const fn offset_table(&self) -> &OffsetTable {
        &self.offset_table
    }

    /// 格納されているオブジェクト番号の一覧を取得する。
    #[inline]
    pub fn object_numbers(&self) -> &[ObjectNumber] {
        self.offset_table.object_numbers()
    }

    /// 各オブジェクトのオフセット一覧を取得する。
    #[inline]
    #[must_use]
    pub fn offsets(&self) -> &[ObjectStreamOffset] {
        self.offset_table.offsets()
    }

    /// インデックス指定（0-based）で内部オブジェクトを取り出す。
    ///
    /// ISO 32000-1 §7.5.7 に従い、内部オブジェクトの世代番号は常に 0 で返される。
    pub fn get_object(&self, index: usize) -> Result<(ObjectId, PdfObject), ObjectStreamError> {
        let object_number = self.offset_table.object_number(index).ok_or_else(|| {
            ObjectStreamError::new(
                ObjectStreamErrorKind::IndexOutOfBounds {
                    index,
                    count: self.metadata.n(),
                },
                self.start_offset,
            )
        })?;

        let stream_offset = self.offset_table.offset(index).ok_or_else(|| {
            ObjectStreamError::new(
                ObjectStreamErrorKind::IndexOutOfBounds {
                    index,
                    count: self.metadata.n(),
                },
                self.start_offset,
            )
        })?;

        let abs_offset = stream_offset
            .absolute_index(self.metadata.first())
            .ok_or_else(|| {
                ObjectStreamError::new(
                    ObjectStreamErrorKind::OffsetOutOfBounds {
                        offset: stream_offset.value(),
                        available_len: self.data.len().saturating_sub(self.metadata.first()),
                    },
                    self.start_offset,
                )
            })?;

        if abs_offset >= self.data.len() {
            return Err(ObjectStreamError::new(
                ObjectStreamErrorKind::OffsetOutOfBounds {
                    offset: stream_offset.value(),
                    available_len: self.data.len().saturating_sub(self.metadata.first()),
                },
                self.start_offset,
            ));
        }

        let mut parser = Parser::new_at(&self.data, abs_offset);
        let object = match parser.parse_object() {
            Ok(obj) => obj,
            Err(e) => {
                if let ParseErrorKind::UnexpectedToken {
                    actual: TokenKind::StreamBegin,
                } = e.kind
                {
                    return Err(ObjectStreamError::new(
                        ObjectStreamErrorKind::StreamInObjectStream,
                        self.start_offset,
                    ));
                }
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InnerObjectParseFailed { kind: e.kind },
                    self.start_offset,
                ));
            }
        };

        // ISO 32000-1 §7.5.7: ストリームオブジェクトの格納は禁止
        if let PdfObject::Stream(_) = object {
            return Err(ObjectStreamError::new(
                ObjectStreamErrorKind::StreamInObjectStream,
                self.start_offset,
            ));
        }

        // 辞書に続いて stream キーワードが直接続く場合もストリームオブジェクトと判定
        if let PdfObject::Dictionary(_) = &object {
            let next_pos = parser.position().value() as usize;
            if next_pos < self.data.len() {
                let mut next_lexer = Lexer::new_at(&self.data, next_pos);
                if matches!(
                    next_lexer.take_token(),
                    LexOutcome::Lexed(Token::StreamBegin)
                ) {
                    return Err(ObjectStreamError::new(
                        ObjectStreamErrorKind::StreamInObjectStream,
                        self.start_offset,
                    ));
                }
            }
        }

        let object_id = ObjectId::new(object_number, GenerationNumber::new(0));
        Ok((object_id, object))
    }

    /// オブジェクト番号から内部オブジェクトを取り出す。存在しない場合は `Ok(None)` を返す。
    pub fn get_object_by_number(
        &self,
        object_number: ObjectNumber,
    ) -> Result<Option<PdfObject>, ObjectStreamError> {
        for (idx, &num) in self.offset_table.object_numbers().iter().enumerate() {
            if num == object_number {
                return self.get_object(idx).map(|(_, obj)| Some(obj));
            }
        }
        Ok(None)
    }

    // --- プライベート復号ヘルパー（フリー関数を排除し impl に集約） ---

    fn decode_stream_data(
        raw: Vec<u8>,
        dict: &PdfDictionary,
        pos: ByteOffset,
    ) -> Result<Vec<u8>, ObjectStreamError> {
        let filter_name =
            Self::extract_single_filter(dict.get(ObjectStreamKey::Filter.as_bytes()), pos)?;
        let decode_parms = Self::extract_single_decode_parms(
            dict.get(ObjectStreamKey::DecodeParms.as_bytes()),
            pos,
        )?;

        let predictor_params = match decode_parms {
            Some(parms) => Some(PredictorParams::from_dictionary(parms, pos).map_err(|_| {
                ObjectStreamError::new(ObjectStreamErrorKind::StreamDecodeFailed, pos)
            })?),
            None => None,
        };

        let decompressed = match filter_name {
            None => raw,
            Some(b"FlateDecode") => decode_zlib(&raw).map_err(|_| {
                ObjectStreamError::new(ObjectStreamErrorKind::StreamDecodeFailed, pos)
            })?,
            Some(_) => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::UnsupportedFilter,
                    pos,
                ))
            }
        };

        match predictor_params {
            None => Ok(decompressed),
            Some(params) => {
                let vec = decode_predictor(&decompressed, &params, pos).map_err(|_| {
                    ObjectStreamError::new(ObjectStreamErrorKind::StreamDecodeFailed, pos)
                })?;
                Ok(vec)
            }
        }
    }

    fn extract_single_filter(
        filter: Option<&PdfObject>,
        pos: ByteOffset,
    ) -> Result<Option<&[u8]>, ObjectStreamError> {
        match filter {
            None => Ok(None),
            Some(PdfObject::Name(name)) => Ok(Some(name.as_bytes())),
            Some(PdfObject::Array(filters)) => match filters.as_slice() {
                [] | [_, _, ..] => Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::UnsupportedFilter,
                    pos,
                )),
                [PdfObject::Name(name)] => Ok(Some(name.as_bytes())),
                [other] => Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::Filter,
                        actual: other.kind(),
                    },
                    pos,
                )),
            },
            Some(other) => Err(ObjectStreamError::new(
                ObjectStreamErrorKind::InvalidKeyType {
                    key: ObjectStreamKey::Filter,
                    actual: other.kind(),
                },
                pos,
            )),
        }
    }

    fn extract_single_decode_parms(
        decode_parms: Option<&PdfObject>,
        pos: ByteOffset,
    ) -> Result<Option<&PdfDictionary>, ObjectStreamError> {
        match decode_parms {
            None => Ok(None),
            Some(PdfObject::Dictionary(parms)) => Ok(Some(parms)),
            Some(PdfObject::Array(values)) => match values.as_slice() {
                [] | [_, _, ..] => Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::DecodeParms,
                        actual: ObjectKind::Array,
                    },
                    pos,
                )),
                [PdfObject::Dictionary(parms)] => Ok(Some(parms)),
                [PdfObject::Null] => Ok(None),
                [other] => Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::DecodeParms,
                        actual: other.kind(),
                    },
                    pos,
                )),
            },
            Some(other) => Err(ObjectStreamError::new(
                ObjectStreamErrorKind::InvalidKeyType {
                    key: ObjectStreamKey::DecodeParms,
                    actual: other.kind(),
                },
                pos,
            )),
        }
    }
}
