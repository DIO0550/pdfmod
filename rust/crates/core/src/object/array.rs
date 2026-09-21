//! PDF 配列オブジェクトを表す `PdfArray` モジュール。

use crate::object::pdf_object::PdfObject;
use core::slice;

/// PDF 配列オブジェクトを表す newtype。
///
/// 要素に `PdfReal(NaN)` を含みうるため、`Eq`, `Hash`, `Ord` は実装しない。
#[derive(Debug, Clone, PartialEq, Default)]
#[must_use]
pub struct PdfArray(Vec<PdfObject>);

impl PdfArray {
    /// 空の `PdfArray` を構築する。
    pub fn new() -> Self {
        Self(Vec::new())
    }

    /// 配列の要素数を返す。
    #[must_use]
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// 配列が空かどうかを返す。
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// 指定インデックスの要素への参照を返す（範囲外の場合は `None`）。
    #[must_use]
    pub fn get(&self, index: usize) -> Option<&PdfObject> {
        self.0.get(index)
    }

    /// 配列の末尾に要素を追加する。
    pub fn push(&mut self, item: impl Into<PdfObject>) {
        self.0.push(item.into());
    }

    /// 要素のスライスを返す。
    pub fn as_slice(&self) -> &[PdfObject] {
        self.0.as_slice()
    }

    /// 要素に対するイテレータを返す。
    pub fn iter(&self) -> slice::Iter<'_, PdfObject> {
        self.0.iter()
    }

    /// 内部の `Vec<PdfObject>` を取り出す。
    #[must_use]
    pub fn into_vec(self) -> Vec<PdfObject> {
        self.0
    }
}

impl From<Vec<PdfObject>> for PdfArray {
    fn from(items: Vec<PdfObject>) -> Self {
        Self(items)
    }
}

impl From<PdfArray> for Vec<PdfObject> {
    fn from(array: PdfArray) -> Self {
        array.into_vec()
    }
}

impl<'a> IntoIterator for &'a PdfArray {
    type Item = &'a PdfObject;
    type IntoIter = slice::Iter<'a, PdfObject>;

    fn into_iter(self) -> Self::IntoIter {
        self.iter()
    }
}

impl IntoIterator for PdfArray {
    type Item = PdfObject;
    type IntoIter = std::vec::IntoIter<PdfObject>;

    fn into_iter(self) -> Self::IntoIter {
        self.0.into_iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn empty_array() {
        let arr = PdfArray::new();
        assert_eq!(arr.len(), 0);
        assert!(arr.is_empty());
        assert_eq!(arr.as_slice(), &[]);
    }

    #[test]
    fn push_and_get() {
        let mut arr = PdfArray::new();
        arr.push(true);
        arr.push(42_i64);
        assert_eq!(arr.len(), 2);
        assert!(!arr.is_empty());
        assert_eq!(arr.get(0), Some(&PdfObject::from(true)));
        assert_eq!(arr.get(1), Some(&PdfObject::from(42_i64)));
    }

    #[test]
    fn get_out_of_bounds() {
        let arr = PdfArray::new();
        assert_eq!(arr.get(0), None);
        assert_eq!(arr.get(100), None);
    }

    #[test]
    fn iter_and_into_vec() {
        let mut arr = PdfArray::new();
        arr.push(1_i64);
        arr.push(2_i64);

        let collected: Vec<&PdfObject> = arr.iter().collect();
        assert_eq!(collected.len(), 2);

        let iter_into: Vec<&PdfObject> = (&arr).into_iter().collect();
        assert_eq!(iter_into.len(), 2);

        let vec = arr.into_vec();
        assert_eq!(vec.len(), 2);
    }

    #[test]
    fn nan_propagation() {
        let mut arr1 = PdfArray::new();
        arr1.push(f64::NAN);
        let mut arr2 = PdfArray::new();
        arr2.push(f64::NAN);
        assert_ne!(arr1, arr2);
    }
}
