//! xref ストリームのオブジェクト番号区間（`/Index` 配列）を担うモジュール。

use crate::byte_offset::ByteOffset;
use crate::object::dictionary::PdfDictionary;
use crate::object::pdf_object::PdfObject;
use crate::xref::error::{XRefError, XRefErrorKind};
use crate::xref::stream::key::XRefStreamKey;

/// xref ストリーム内のオブジェクト番号範囲の集合（ISO 32000-1 §7.5.8.2 /Index 配列）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IndexRanges {
    ranges: Vec<(u64, u64)>,
    total_entries: usize,
}

impl IndexRanges {
    /// 辞書から `/Index` 配列を抽出し、[`IndexRanges`] を構築する。
    /// 省略時は `[0, size]` を暗黙値とする。
    pub fn from_dictionary(
        dict: &PdfDictionary,
        size: u64,
        pos: ByteOffset,
    ) -> Result<Self, XRefError> {
        match dict.get(XRefStreamKey::Index.as_bytes()) {
            None => Self::from_default(size, pos),
            Some(PdfObject::Array(arr)) => Self::from_array(arr, size, pos),
            Some(other) => Err(XRefError::new(
                XRefErrorKind::InvalidKeyType {
                    key: XRefStreamKey::Index,
                    actual: other.kind(),
                },
                pos,
            )),
        }
    }

    /// 省略時の暗黙区間 `[0, size]` から構築する。
    pub fn from_default(size: u64, pos: ByteOffset) -> Result<Self, XRefError> {
        let total_entries = usize::try_from(size)
            .map_err(|_| XRefError::new(XRefErrorKind::InvalidIndexArray, pos))?;
        Ok(Self {
            ranges: vec![(0, size)],
            total_entries,
        })
    }

    /// 配列オブジェクトから区間リストを抽出・検証して構築する。
    /// 各区間の終端（`first + count`）が `/Size`（`size`）を超えないことを検証する。
    pub fn from_array(arr: &[PdfObject], size: u64, pos: ByteOffset) -> Result<Self, XRefError> {
        if !arr.len().is_multiple_of(2) || arr.is_empty() {
            return Err(XRefError::new(XRefErrorKind::InvalidIndexArray, pos));
        }

        let mut ranges = Vec::with_capacity(arr.len() / 2);
        for [first_obj, count_obj] in arr.as_chunks::<2>().0 {
            let first = match first_obj {
                PdfObject::Integer(n) if *n >= 0 => *n as u64,
                _ => return Err(XRefError::new(XRefErrorKind::InvalidIndexArray, pos)),
            };
            let count = match count_obj {
                PdfObject::Integer(n) if *n >= 0 => *n as u64,
                _ => return Err(XRefError::new(XRefErrorKind::InvalidIndexArray, pos)),
            };
            let end = first
                .checked_add(count)
                .ok_or_else(|| XRefError::new(XRefErrorKind::InvalidIndexArray, pos))?;
            if end > size {
                return Err(XRefError::new(XRefErrorKind::InvalidIndexArray, pos));
            }
            ranges.push((first, count));
        }

        let total_entries = ranges
            .iter()
            .try_fold(0usize, |acc, &(_, count)| {
                let c = usize::try_from(count).ok()?;
                acc.checked_add(c)
            })
            .ok_or_else(|| XRefError::new(XRefErrorKind::InvalidIndexArray, pos))?;

        Ok(Self {
            ranges,
            total_entries,
        })
    }

    /// 総エントリ数を取得する。
    #[inline]
    #[must_use]
    pub const fn total_entries(&self) -> usize {
        self.total_entries
    }

    /// 各区間のオブジェクト番号を順次生成するイテレータを返す。
    pub fn object_numbers(
        &self,
        pos: ByteOffset,
    ) -> impl Iterator<Item = Result<u64, XRefError>> + '_ {
        self.ranges.iter().flat_map(move |&(first, count)| {
            (0..count).map(move |i| {
                first
                    .checked_add(i)
                    .ok_or_else(|| XRefError::new(XRefErrorKind::InvalidIndexArray, pos))
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn from_default_creates_single_range() {
        let pos = ByteOffset::new(0);
        let ranges = IndexRanges::from_default(10, pos).unwrap();
        assert_eq!(ranges.total_entries(), 10);
        let nums: Vec<u64> = ranges
            .object_numbers(pos)
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(nums, (0..10).collect::<Vec<_>>());
    }

    #[test]
    fn from_array_multiple_ranges() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(1),
            PdfObject::Integer(3),
            PdfObject::Integer(10),
            PdfObject::Integer(2),
        ];
        let ranges = IndexRanges::from_array(&arr, 15, pos).unwrap();
        assert_eq!(ranges.total_entries(), 5);
        let nums: Vec<u64> = ranges
            .object_numbers(pos)
            .collect::<Result<Vec<_>, _>>()
            .unwrap();
        assert_eq!(nums, vec![1, 2, 3, 10, 11]);
    }

    #[test]
    fn from_array_odd_length_rejected() {
        let pos = ByteOffset::new(0);
        let arr = vec![
            PdfObject::Integer(0),
            PdfObject::Integer(5),
            PdfObject::Integer(10),
        ];
        assert_eq!(
            IndexRanges::from_array(&arr, 20, pos).unwrap_err().kind,
            XRefErrorKind::InvalidIndexArray
        );
    }

    #[test]
    fn from_array_empty_rejected() {
        let pos = ByteOffset::new(0);
        assert_eq!(
            IndexRanges::from_array(&[], 10, pos).unwrap_err().kind,
            XRefErrorKind::InvalidIndexArray
        );
    }

    #[test]
    fn from_array_negative_integer_rejected() {
        let pos = ByteOffset::new(0);
        let arr = vec![PdfObject::Integer(-1), PdfObject::Integer(5)];
        assert_eq!(
            IndexRanges::from_array(&arr, 10, pos).unwrap_err().kind,
            XRefErrorKind::InvalidIndexArray
        );

        let arr2 = vec![PdfObject::Integer(0), PdfObject::Integer(-5)];
        assert_eq!(
            IndexRanges::from_array(&arr2, 10, pos).unwrap_err().kind,
            XRefErrorKind::InvalidIndexArray
        );
    }

    #[test]
    fn from_array_exceeding_size_rejected() {
        let pos = ByteOffset::new(0);
        // size is 5, but range is 0..6 (first 0, count 6 -> end 6 > 5)
        let arr = vec![PdfObject::Integer(0), PdfObject::Integer(6)];
        assert_eq!(
            IndexRanges::from_array(&arr, 5, pos).unwrap_err().kind,
            XRefErrorKind::InvalidIndexArray
        );

        // size is 10, first is 8, count is 3 -> end 11 > 10
        let arr2 = vec![PdfObject::Integer(8), PdfObject::Integer(3)];
        assert_eq!(
            IndexRanges::from_array(&arr2, 10, pos).unwrap_err().kind,
            XRefErrorKind::InvalidIndexArray
        );
    }
}
