//! xref ストリームの解析モジュール（ISO 32000-1 §7.5.8）。

pub mod field_widths;
pub mod index_ranges;
pub mod key;

use std::borrow::Cow;

use crate::byte_offset::ByteOffset;
use crate::filter::flate::decode_zlib;
use crate::filter::predictor::{decode_predictor, PredictorParams};
use crate::object::dictionary::PdfDictionary;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::parser::Parser;
use crate::xref::error::{XRefError, XRefErrorKind};
use crate::xref::stream::field_widths::FieldWidths;
use crate::xref::stream::index_ranges::IndexRanges;
use crate::xref::stream::key::XRefStreamKey;
use crate::xref::table::XRefTable;
use crate::xref::trailer::key::TrailerKey;
use crate::xref::trailer::Trailer;

/// xref ストリームの解析結果。
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub struct ParsedXRefStream {
    table: XRefTable,
    trailer: Option<Trailer>,
    end: ByteOffset,
}

impl ParsedXRefStream {
    /// 構築された [`XRefTable`] への参照を取得する。
    #[inline]
    #[must_use]
    pub const fn table(&self) -> &XRefTable {
        &self.table
    }

    /// 所有権を渡して [`XRefTable`] を取得する。
    #[inline]
    #[must_use]
    pub fn into_table(self) -> XRefTable {
        self.table
    }

    /// トレイラ情報への参照を取得する（`/Root` 欠損時は `None`）。
    #[inline]
    #[must_use]
    pub const fn trailer(&self) -> Option<&Trailer> {
        self.trailer.as_ref()
    }

    /// ストリームオブジェクトを読み終えた位置を取得する。
    #[inline]
    pub const fn end(&self) -> ByteOffset {
        self.end
    }

    /// 構成要素に分解する。
    #[inline]
    pub fn into_parts(self) -> (XRefTable, Option<Trailer>, ByteOffset) {
        (self.table, self.trailer, self.end)
    }

    /// 指定位置の xref ストリームオブジェクトを解析する（`rules/rust.md` の「ロジックは impl に置く」に準拠）。
    pub fn parse(input: &[u8], offset: ByteOffset) -> Result<Self, XRefError> {
        let usize_offset = usize::try_from(offset.value())
            .map_err(|_| XRefError::new(XRefErrorKind::NotAnXRefStream, offset))?;
        if usize_offset > input.len() {
            return Err(XRefError::new(XRefErrorKind::NotAnXRefStream, offset));
        }

        let mut parser = Parser::new_at(input, usize_offset);
        let indirect = parser.parse_indirect_object().map_err(|e| {
            XRefError::new(XRefErrorKind::ObjectParseFailed { kind: e.kind }, offset)
        })?;
        let end_pos = parser.position();

        let (_, body) = indirect.into_parts();
        let stream = match body {
            PdfObject::Stream(s) => s,
            _ => return Err(XRefError::new(XRefErrorKind::NotAnXRefStream, offset)),
        };

        let (dict, raw_data) = stream.into_parts();

        // /Type /XRef 検証
        verify_xref_type(&dict, offset)?;

        // /Size, /W, /Index 取得
        let size = extract_size(&dict, offset)?;
        let widths = FieldWidths::from_dictionary(&dict, offset)?;
        let index_ranges = IndexRanges::from_dictionary(&dict, size, offset)?;

        // /Filter, /DecodeParms による復号（Cow により非圧縮時の余分なアロケーションを排除）
        let decoded_data = decode_stream_data(&raw_data, &dict, offset)?;

        // データ長検証
        let expected_len = index_ranges
            .total_entries()
            .checked_mul(widths.record_size())
            .ok_or_else(|| XRefError::new(XRefErrorKind::InvalidIndexArray, offset))?;

        if decoded_data.len() != expected_len {
            return Err(XRefError::new(
                XRefErrorKind::DataLengthMismatch {
                    expected: expected_len,
                    actual: decoded_data.len(),
                },
                offset,
            ));
        }

        // エントリのデコードとテーブル構築
        let mut table = XRefTable::new();
        for (obj_num_res, chunk) in index_ranges
            .object_numbers(offset)
            .zip(decoded_data.chunks_exact(widths.record_size()))
        {
            let obj_num_val = obj_num_res?;
            let entry = widths.decode_entry(chunk, offset)?;

            // オブジェクト番号 0 は登録スキップ（#334 規約）
            if let Some(number) = ObjectNumber::new(obj_num_val) {
                table.insert(number, entry);
            }
        }

        // トレイラ情報抽出（Trailer::from_dictionary の再利用、/Root 欠損許容）
        let trailer = extract_trailer(dict, offset)?;

        Ok(Self {
            table,
            trailer,
            end: end_pos,
        })
    }
}

/// 指定位置の xref ストリームオブジェクトを解析する（[`ParsedXRefStream::parse`] への委譲）。
pub fn parse(input: &[u8], offset: ByteOffset) -> Result<ParsedXRefStream, XRefError> {
    ParsedXRefStream::parse(input, offset)
}

fn verify_xref_type(dict: &PdfDictionary, pos: ByteOffset) -> Result<(), XRefError> {
    match dict.get(XRefStreamKey::Type.as_bytes()) {
        Some(PdfObject::Name(name)) if name.as_bytes() == b"XRef" => Ok(()),
        _ => Err(XRefError::new(XRefErrorKind::NotAnXRefStream, pos)),
    }
}

fn extract_size(dict: &PdfDictionary, pos: ByteOffset) -> Result<u64, XRefError> {
    match dict.get(XRefStreamKey::Size.as_bytes()) {
        Some(PdfObject::Integer(n)) if *n >= 0 => Ok(*n as u64),
        Some(PdfObject::Integer(_)) => Err(XRefError::new(
            XRefErrorKind::NegativeValue {
                key: XRefStreamKey::Size,
            },
            pos,
        )),
        Some(other) => Err(XRefError::new(
            XRefErrorKind::InvalidKeyType {
                key: XRefStreamKey::Size,
                actual: other.kind(),
            },
            pos,
        )),
        None => Err(XRefError::new(
            XRefErrorKind::MissingRequiredKey {
                key: XRefStreamKey::Size,
            },
            pos,
        )),
    }
}

fn decode_stream_data<'a>(
    raw: &'a [u8],
    dict: &PdfDictionary,
    pos: ByteOffset,
) -> Result<Cow<'a, [u8]>, XRefError> {
    let filter_obj = dict.get(XRefStreamKey::Filter.as_bytes());
    let decompressed: Cow<'a, [u8]> = match filter_obj {
        None => Cow::Borrowed(raw),
        Some(PdfObject::Name(n)) if n.as_bytes() == b"FlateDecode" => {
            let vec = decode_zlib(raw)
                .map_err(|_| XRefError::new(XRefErrorKind::StreamDecodeFailed, pos))?;
            Cow::Owned(vec)
        }
        Some(PdfObject::Name(_)) => {
            return Err(XRefError::new(XRefErrorKind::UnsupportedFilter, pos))
        }
        Some(other) => {
            return Err(XRefError::new(
                XRefErrorKind::InvalidKeyType {
                    key: XRefStreamKey::Filter,
                    actual: other.kind(),
                },
                pos,
            ))
        }
    };

    match dict.get(XRefStreamKey::DecodeParms.as_bytes()) {
        None => Ok(decompressed),
        Some(PdfObject::Dictionary(parms)) => {
            let params = PredictorParams::from_dictionary(parms, pos)
                .map_err(|_| XRefError::new(XRefErrorKind::StreamDecodeFailed, pos))?;
            let vec = decode_predictor(&decompressed, &params, pos)
                .map_err(|_| XRefError::new(XRefErrorKind::StreamDecodeFailed, pos))?;
            Ok(Cow::Owned(vec))
        }
        Some(other) => Err(XRefError::new(
            XRefErrorKind::InvalidKeyType {
                key: XRefStreamKey::DecodeParms,
                actual: other.kind(),
            },
            pos,
        )),
    }
}

fn extract_trailer(dict: PdfDictionary, pos: ByteOffset) -> Result<Option<Trailer>, XRefError> {
    if !dict.contains_key(TrailerKey::Root.as_bytes()) {
        return Ok(None);
    }
    Trailer::from_dictionary(dict, pos)
        .map(Some)
        .map_err(|e| XRefError::new(XRefErrorKind::Trailer(e.kind), pos))
}

#[cfg(test)]
mod tests;
