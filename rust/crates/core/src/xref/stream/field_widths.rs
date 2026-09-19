//! xref ストリームのフィールド幅（`/W` 配列）およびレコードデコードを担うモジュール。

use crate::binary::ByteReader;
use crate::byte_offset::ByteOffset;
use crate::object::dictionary::PdfDictionary;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::xref::entry::XRefEntry;
use crate::xref::error::{XRefError, XRefErrorKind};
use crate::xref::stream::key::XRefStreamKey;

/// Field 1（エントリ種別列）のバイト幅。
///
/// 不変条件: `0 <= width <= 2`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Field1Width(u8);

impl Field1Width {
    /// 許容最大バイト幅。
    pub const MAX: usize = 2;

    /// PDF オブジェクトから [`Field1Width`] を構築する。
    pub fn try_from_object(obj: &PdfObject, pos: ByteOffset) -> Result<Self, XRefError> {
        match obj {
            PdfObject::Integer(n) if (0..=2).contains(n) => Ok(Self(*n as u8)),
            _ => Err(XRefError::new(XRefErrorKind::InvalidWArray, pos)),
        }
    }

    /// バイト幅（usize）を取得する。
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> usize {
        self.0 as usize
    }

    /// [`ByteReader`] からエントリ種別（type 0, 1, 2）を読み取る。
    /// 幅が 0 の場合は仕様に基づき既定値 1 (in-use) を補完する。
    pub(crate) fn read_entry_type(self, reader: &mut ByteReader<'_>) -> Option<u64> {
        if self.0 == 0 {
            Some(1) // 幅 0 の場合は通常エントリ（type 1）を暗黙値とする
        } else {
            reader.read_be_uint(self.as_usize())
        }
    }
}

/// Field 2（オフセット / 親オブジェクト番号列）のバイト幅。
///
/// 不変条件: `0 <= width <= 8`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Field2Width(u8);

impl Field2Width {
    /// 許容最大バイト幅。
    pub const MAX: usize = 8;

    /// PDF オブジェクトから [`Field2Width`] を構築する。
    pub fn try_from_object(obj: &PdfObject, pos: ByteOffset) -> Result<Self, XRefError> {
        match obj {
            PdfObject::Integer(n) if (0..=8).contains(n) => Ok(Self(*n as u8)),
            _ => Err(XRefError::new(XRefErrorKind::InvalidWArray, pos)),
        }
    }

    /// バイト幅（usize）を取得する。
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> usize {
        self.0 as usize
    }

    /// [`ByteReader`] からフィールド値を読み取る。
    pub(crate) fn read_value(self, reader: &mut ByteReader<'_>) -> Option<u64> {
        reader.read_be_uint(self.as_usize())
    }
}

/// Field 3（世代番号 / ストリーム内インデックス列）のバイト幅。
///
/// 不変条件: `0 <= width <= 4`
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Field3Width(u8);

impl Field3Width {
    /// 許容最大バイト幅。
    pub const MAX: usize = 4;

    /// PDF オブジェクトから [`Field3Width`] を構築する。
    pub fn try_from_object(obj: &PdfObject, pos: ByteOffset) -> Result<Self, XRefError> {
        match obj {
            PdfObject::Integer(n) if (0..=4).contains(n) => Ok(Self(*n as u8)),
            _ => Err(XRefError::new(XRefErrorKind::InvalidWArray, pos)),
        }
    }

    /// バイト幅（usize）を取得する。
    #[inline]
    #[must_use]
    pub const fn as_usize(self) -> usize {
        self.0 as usize
    }

    /// [`ByteReader`] からフィールド値を読み取る。
    pub(crate) fn read_value(self, reader: &mut ByteReader<'_>) -> Option<u64> {
        reader.read_be_uint(self.as_usize())
    }
}

/// xref ストリームの各フィールドのバイト幅（ISO 32000-1 §7.5.8.2 /W 配列）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct FieldWidths {
    w0: Field1Width,
    w1: Field2Width,
    w2: Field3Width,
    record_size: usize,
}

impl FieldWidths {
    /// 辞書から `/W` 配列を取り出して [`FieldWidths`] を構築する。
    pub fn from_dictionary(dict: &PdfDictionary, pos: ByteOffset) -> Result<Self, XRefError> {
        let arr = match dict.get(XRefStreamKey::W.as_bytes()) {
            Some(PdfObject::Array(a)) => a,
            Some(other) => {
                return Err(XRefError::new(
                    XRefErrorKind::InvalidKeyType {
                        key: XRefStreamKey::W,
                        actual: other.kind(),
                    },
                    pos,
                ))
            }
            None => {
                return Err(XRefError::new(
                    XRefErrorKind::MissingRequiredKey {
                        key: XRefStreamKey::W,
                    },
                    pos,
                ))
            }
        };
        Self::from_array(arr, pos)
    }

    /// 3 要素の配列オブジェクトから [`FieldWidths`] を構築する。
    pub fn from_array(arr: &[PdfObject], pos: ByteOffset) -> Result<Self, XRefError> {
        let [f1, f2, f3] = match arr {
            [a, b, c] => [a, b, c],
            _ => return Err(XRefError::new(XRefErrorKind::InvalidWArray, pos)),
        };

        let w0 = Field1Width::try_from_object(f1, pos)?;
        let w1 = Field2Width::try_from_object(f2, pos)?;
        let w2 = Field3Width::try_from_object(f3, pos)?;

        let record_size = w0.as_usize() + w1.as_usize() + w2.as_usize();
        if record_size == 0 {
            return Err(XRefError::new(XRefErrorKind::InvalidWArray, pos));
        }

        Ok(Self {
            w0,
            w1,
            w2,
            record_size,
        })
    }

    /// 1 レコードのバイト長を取得する。
    #[inline]
    #[must_use]
    pub const fn record_size(&self) -> usize {
        self.record_size
    }

    /// 1 レコード分のバイト列から [`XRefEntry`] をデコードする。
    pub fn decode_entry(&self, record: &[u8], pos: ByteOffset) -> Result<XRefEntry, XRefError> {
        let mut reader = ByteReader::new(record);

        let entry_type = self
            .w0
            .read_entry_type(&mut reader)
            .ok_or_else(|| XRefError::new(XRefErrorKind::UnexpectedEof, pos))?;

        let field2 = self
            .w1
            .read_value(&mut reader)
            .ok_or_else(|| XRefError::new(XRefErrorKind::UnexpectedEof, pos))?;

        let field3 = self
            .w2
            .read_value(&mut reader)
            .ok_or_else(|| XRefError::new(XRefErrorKind::UnexpectedEof, pos))?;

        match entry_type {
            0 => {
                let next_free = FreeObjectNumber::new(field2);
                let generation = GenerationNumber::try_from_u64(field3).ok_or_else(|| {
                    XRefError::new(XRefErrorKind::GenerationOutOfRange { value: field3 }, pos)
                })?;
                Ok(XRefEntry::Free {
                    next_free_object: next_free,
                    generation,
                })
            }
            1 => {
                let generation = GenerationNumber::try_from_u64(field3).ok_or_else(|| {
                    XRefError::new(XRefErrorKind::GenerationOutOfRange { value: field3 }, pos)
                })?;
                Ok(XRefEntry::InUse {
                    offset: ByteOffset::new(field2),
                    generation,
                })
            }
            2 => {
                let stream_obj_num = ObjectNumber::new(field2)
                    .ok_or_else(|| XRefError::new(XRefErrorKind::InvalidObjectNumber, pos))?;
                let index = u32::try_from(field3)
                    .map_err(|_| XRefError::new(XRefErrorKind::InvalidNumber, pos))?;
                Ok(XRefEntry::InObjectStream {
                    stream_object: stream_obj_num,
                    index_in_stream: index,
                })
            }
            other => Err(XRefError::new(
                XRefErrorKind::InvalidEntryType { actual: other },
                pos,
            )),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn field_widths_from_array_valid() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(1),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        assert_eq!(widths.record_size(), 4);
    }

    #[test]
    fn field_widths_from_array_zero_fields() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(0),
            PdfObject::Integer(3),
            PdfObject::Integer(0),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        assert_eq!(widths.record_size(), 3);
    }

    #[test]
    fn field_widths_from_array_all_zero_rejected() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(0),
            PdfObject::Integer(0),
            PdfObject::Integer(0),
        ];
        let err = FieldWidths::from_array(&arr, pos).unwrap_err();
        assert_eq!(err.kind, XRefErrorKind::InvalidWArray);
    }

    #[test]
    fn field_widths_from_array_invalid_len() {
        let pos = ByteOffset::new(0);
        let arr = vec![PdfObject::Integer(1), PdfObject::Integer(2)];
        assert_eq!(
            FieldWidths::from_array(&arr, pos).unwrap_err().kind,
            XRefErrorKind::InvalidWArray
        );
    }

    #[test]
    fn field_widths_from_array_out_of_range() {
        let pos = ByteOffset::new(0);
        // Field 1 max is 2
        let arr = vec![
            PdfObject::Integer(3),
            PdfObject::Integer(2),
            PdfObject::Integer(1),
        ];
        assert_eq!(
            FieldWidths::from_array(&arr, pos).unwrap_err().kind,
            XRefErrorKind::InvalidWArray
        );

        // Field 2 max is 8
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(9),
            PdfObject::Integer(1),
        ];
        assert_eq!(
            FieldWidths::from_array(&arr, pos).unwrap_err().kind,
            XRefErrorKind::InvalidWArray
        );

        // Field 3 max is 4
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(5),
        ];
        assert_eq!(
            FieldWidths::from_array(&arr, pos).unwrap_err().kind,
            XRefErrorKind::InvalidWArray
        );
    }

    #[test]
    fn decode_entry_type1_in_use() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(1),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        // Type 1, offset 258 (0x0102), gen 0 (0x00)
        let record = [0x01, 0x01, 0x02, 0x00];
        let entry = widths.decode_entry(&record, pos).unwrap();
        assert_eq!(
            entry,
            XRefEntry::InUse {
                offset: ByteOffset::new(258),
                generation: GenerationNumber::new(0),
            }
        );
    }

    #[test]
    fn decode_entry_type0_free() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(2),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        // Type 0, next_free 0, gen 65535 (0xffff)
        let record = [0x00, 0x00, 0x00, 0xff, 0xff];
        let entry = widths.decode_entry(&record, pos).unwrap();
        assert_eq!(
            entry,
            XRefEntry::Free {
                next_free_object: FreeObjectNumber::new(0),
                generation: GenerationNumber::new(65535),
            }
        );
    }

    #[test]
    fn decode_entry_type2_in_object_stream() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(1),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        // Type 2, stream_obj 10 (0x000a), index 3 (0x03)
        let record = [0x02, 0x00, 0x0a, 0x03];
        let entry = widths.decode_entry(&record, pos).unwrap();
        assert_eq!(
            entry,
            XRefEntry::InObjectStream {
                stream_object: ObjectNumber::new(10).unwrap(),
                index_in_stream: 3,
            }
        );
    }

    #[test]
    fn decode_entry_w0_zero_defaults_to_type1() {
        let pos = ByteOffset::new(0);
        // Field 1 width is 0 -> defaults to type 1
        let arr = vec![
            PdfObject::Integer(0),
            PdfObject::Integer(2),
            PdfObject::Integer(1),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        let record = [0x01, 0x00, 0x00]; // offset 256, gen 0
        let entry = widths.decode_entry(&record, pos).unwrap();
        assert_eq!(
            entry,
            XRefEntry::InUse {
                offset: ByteOffset::new(256),
                generation: GenerationNumber::new(0),
            }
        );
    }

    #[test]
    fn decode_entry_type2_with_zero_stream_object_rejected() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(1),
            PdfObject::Integer(1),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        let record = [0x02, 0x00, 0x00]; // stream_obj 0 -> invalid
        let err = widths.decode_entry(&record, pos).unwrap_err();
        assert_eq!(err.kind, XRefErrorKind::InvalidObjectNumber);
    }

    #[test]
    fn decode_entry_invalid_type_rejected() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(1),
            PdfObject::Integer(1),
        ];
        let widths = FieldWidths::from_array(&arr, pos).unwrap();
        let record = [0x03, 0x00, 0x00]; // type 3 -> invalid
        let err = widths.decode_entry(&record, pos).unwrap_err();
        assert_eq!(err.kind, XRefErrorKind::InvalidEntryType { actual: 3 });
    }
}
