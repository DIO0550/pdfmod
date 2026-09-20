//! オブジェクトストリーム内のオフセットテーブル（ISO 32000-1 §7.5.7）。

use crate::byte_offset::ByteOffset;
use crate::lexer::outcome::LexOutcome;
use crate::lexer::token::{Primitive, Token};
use crate::lexer::Lexer;
use crate::object::object_number::ObjectNumber;
use crate::object_stream::error::{ObjectStreamError, ObjectStreamErrorKind};
use crate::object_stream::offset::ObjectStreamOffset;

/// オブジェクトストリーム内のオブジェクト番号と相対オフセットの対応テーブル。
///
/// 先頭 `/First` バイト（ヘッダ部）の整数ペア列を解析して構築され、
/// `object_numbers` と `offsets` の長さが常に一致している（`len() == expected_count`）という
/// 不変条件を保証する。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct OffsetTable {
    object_numbers: Vec<ObjectNumber>,
    offsets: Vec<ObjectStreamOffset>,
}

impl OffsetTable {
    /// ヘッダ領域のバイト列を走査し、オフセットテーブルを解析・構築する。
    pub fn parse(
        header_bytes: &[u8],
        expected_count: usize,
        first: usize,
        data_len: usize,
        pos: ByteOffset,
    ) -> Result<Self, ObjectStreamError> {
        let mut lexer = Lexer::new(header_bytes);
        let mut object_numbers = Vec::with_capacity(expected_count);
        let mut offsets = Vec::with_capacity(expected_count);
        let available_len = data_len.saturating_sub(first);

        for _ in 0..expected_count {
            let num_tok = match lexer.take_token() {
                LexOutcome::Lexed(Token::Primitive(Primitive::Integer(n))) => n,
                LexOutcome::Lexed(_) | LexOutcome::Eof | LexOutcome::Malformed { .. } => {
                    return Err(ObjectStreamError::new(
                        ObjectStreamErrorKind::PairCountMismatch {
                            expected: expected_count,
                            actual: object_numbers.len(),
                        },
                        pos,
                    ))
                }
            };

            let obj_num = ObjectNumber::try_from_i64(num_tok).ok_or_else(|| {
                ObjectStreamError::new(ObjectStreamErrorKind::InvalidObjectNumber(num_tok), pos)
            })?;

            let offset_tok = match lexer.take_token() {
                LexOutcome::Lexed(Token::Primitive(Primitive::Integer(off))) => off,
                LexOutcome::Lexed(_) | LexOutcome::Eof | LexOutcome::Malformed { .. } => {
                    return Err(ObjectStreamError::new(
                        ObjectStreamErrorKind::PairCountMismatch {
                            expected: expected_count,
                            actual: offsets.len(),
                        },
                        pos,
                    ))
                }
            };

            if offset_tok < 0 {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidOffset(offset_tok),
                    pos,
                ));
            }

            let rel_offset = usize::try_from(offset_tok).map_err(|_| {
                ObjectStreamError::new(
                    ObjectStreamErrorKind::OffsetOutOfBounds {
                        offset: usize::MAX,
                        available_len,
                    },
                    pos,
                )
            })?;

            if rel_offset >= available_len {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::OffsetOutOfBounds {
                        offset: rel_offset,
                        available_len,
                    },
                    pos,
                ));
            }

            object_numbers.push(obj_num);
            offsets.push(ObjectStreamOffset::new(rel_offset));
        }

        // 余剰トークンが存在しないかを検証
        match lexer.take_token() {
            LexOutcome::Eof => Ok(Self {
                object_numbers,
                offsets,
            }),
            LexOutcome::Lexed(_) | LexOutcome::Malformed { .. } => Err(ObjectStreamError::new(
                ObjectStreamErrorKind::PairCountMismatch {
                    expected: expected_count,
                    actual: object_numbers.len() + 1,
                },
                pos,
            )),
        }
    }

    /// 格納されているオブジェクト数を取得する。
    #[inline]
    #[must_use]
    pub fn len(&self) -> usize {
        self.object_numbers.len()
    }

    /// 格納オブジェクトが空であるか判定する。
    #[inline]
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.object_numbers.is_empty()
    }

    /// 指定インデックスのオブジェクト番号を取得する。
    #[inline]
    #[must_use]
    pub fn object_number(&self, index: usize) -> Option<ObjectNumber> {
        self.object_numbers.get(index).copied()
    }

    /// 指定インデックスの相対オフセットを取得する。
    #[inline]
    #[must_use]
    pub fn offset(&self, index: usize) -> Option<ObjectStreamOffset> {
        self.offsets.get(index).copied()
    }

    /// 全オブジェクト番号のスライスを取得する。
    #[inline]
    pub fn object_numbers(&self) -> &[ObjectNumber] {
        &self.object_numbers
    }

    /// 全相対オフセットのスライスを取得する。
    #[inline]
    #[must_use]
    pub fn offsets(&self) -> &[ObjectStreamOffset] {
        &self.offsets
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_valid_pairs() {
        let header = b"11 0 12 15 13 30";
        let table = OffsetTable::parse(header, 3, 20, 100, ByteOffset::new(0)).unwrap();
        assert_eq!(table.len(), 3);
        assert!(!table.is_empty());
        assert_eq!(table.object_number(0).unwrap().value(), 11);
        assert_eq!(table.offset(0).unwrap().value(), 0);
        assert_eq!(table.object_number(1).unwrap().value(), 12);
        assert_eq!(table.offset(1).unwrap().value(), 15);
        assert_eq!(table.object_number(2).unwrap().value(), 13);
        assert_eq!(table.offset(2).unwrap().value(), 30);
    }

    #[test]
    fn parse_count_mismatch() {
        let header = b"11 0";
        let err = OffsetTable::parse(header, 2, 10, 100, ByteOffset::new(0)).unwrap_err();
        assert_eq!(
            err.kind,
            ObjectStreamErrorKind::PairCountMismatch {
                expected: 2,
                actual: 1
            }
        );
    }

    #[test]
    fn parse_excess_tokens() {
        let header = b"11 0 12 10 99";
        let err = OffsetTable::parse(header, 2, 10, 100, ByteOffset::new(0)).unwrap_err();
        assert_eq!(
            err.kind,
            ObjectStreamErrorKind::PairCountMismatch {
                expected: 2,
                actual: 3
            }
        );
    }

    #[test]
    fn parse_offset_out_of_bounds() {
        let header = b"11 50";
        // available_len = 100 - 60 = 40, offset 50 >= 40 -> error
        let err = OffsetTable::parse(header, 1, 60, 100, ByteOffset::new(0)).unwrap_err();
        assert_eq!(
            err.kind,
            ObjectStreamErrorKind::OffsetOutOfBounds {
                offset: 50,
                available_len: 40
            }
        );
    }

    #[test]
    fn parse_negative_offset() {
        let header = b"11 -5";
        let err = OffsetTable::parse(header, 1, 60, 100, ByteOffset::new(0)).unwrap_err();
        assert_eq!(err.kind, ObjectStreamErrorKind::InvalidOffset(-5));
    }
}
