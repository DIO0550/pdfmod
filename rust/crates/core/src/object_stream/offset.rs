//! オブジェクトストリーム内の相対オフセット newtype（ISO 32000-1 §7.5.7）。

/// オブジェクトストリーム内の相対バイトオフセット（`/First` からの位置）。
///
/// ファイル全体の絶対位置を表す [`crate::byte_offset::ByteOffset`] と区別し、
/// ストリーム内部の相対位置であることを型レベルで保証する。
///
/// # 妥当性検証について
/// 本型は任意の `usize` から無検証で構築できる。
/// データ領域の範囲内（`first + offset <= data.len()`）であるかの妥当性検証は
/// [`crate::object_stream::offset_table::OffsetTable`] が担う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ObjectStreamOffset(usize);

impl ObjectStreamOffset {
    /// 新しい [`ObjectStreamOffset`] を構築する。
    #[inline]
    #[must_use]
    pub const fn new(offset: usize) -> Self {
        Self(offset)
    }

    /// 相対オフセットの生値を取得する。
    #[inline]
    #[must_use]
    pub const fn value(self) -> usize {
        self.0
    }

    /// `/First` の値と合算し、展開後データ内での絶対インデックスを算出する。
    #[inline]
    #[must_use]
    pub fn absolute_index(self, first: usize) -> Option<usize> {
        first.checked_add(self.0)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn value_and_absolute_index() {
        let offset = ObjectStreamOffset::new(100);
        assert_eq!(offset.value(), 100);
        assert_eq!(offset.absolute_index(50), Some(150));
        assert_eq!(offset.absolute_index(usize::MAX), None);
    }
}
