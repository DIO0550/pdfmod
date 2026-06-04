//! PDF ファイル内のバイトオフセット（先頭からの位置）を表す `ByteOffset` を定義するモジュール。
//!
//! 裸の `u64` と取り違えないための newtype。xref が指す間接オブジェクトのファイル内位置などの
//! 構成要素として用いる。生成は無検証（infallible）で、0（ファイル先頭）や `u64::MAX` も
//! 無条件に受理する。値の妥当性検証（ファイルサイズ超過等）は xref レイヤ（R2）に委譲する。

/// PDF ファイル内のバイトオフセット。ファイル先頭からの位置を表す非負整数のラッパ。
///
/// 内部表現は `u64`（Issue #257 指定）。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは内部 `u64` の自然な振る舞いに従う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ByteOffset(u64);

impl ByteOffset {
    /// 与えられた `u64` から `ByteOffset` を生成する。
    ///
    /// 無検証（infallible）。0 や `u64::MAX` を含む任意の値を受理する。
    pub fn new(n: u64) -> ByteOffset {
        ByteOffset(n)
    }

    /// 内部のバイトオフセットを `u64` として取り出す。
    pub fn value(&self) -> u64 {
        self.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::collections::HashSet;

    #[test]
    fn new_then_value_roundtrips() {
        // 代表値（0 / 1 / 42 / u64::MAX）を new で包んで value で取り出すと、生成時の値と一致することを確認する
        for n in [0, 1, 42, u64::MAX] {
            assert_eq!(ByteOffset::new(n).value(), n);
        }
    }

    #[test]
    fn accepts_zero() {
        // ファイル先頭を表す 0 が無検証で受理され、値が保持されることを確認する
        assert_eq!(ByteOffset::new(0).value(), 0);
    }

    #[test]
    fn accepts_one() {
        // 1 が無検証で受理され、値が保持されることを確認する
        assert_eq!(ByteOffset::new(1).value(), 1);
    }

    #[test]
    fn accepts_u64_max() {
        // 最大値 u64::MAX も無検証で受理され、値が保持されることを確認する
        assert_eq!(ByteOffset::new(u64::MAX).value(), u64::MAX);
    }

    #[test]
    fn equal_offsets_are_equal() {
        // 同一値から生成した 2 つが == で等価と判定されることを確認する
        assert_eq!(ByteOffset::new(7), ByteOffset::new(7));
    }

    #[test]
    fn different_offsets_are_not_equal() {
        // 異なる値から生成した 2 つが != で非等価と判定されることを確認する
        assert_ne!(ByteOffset::new(7), ByteOffset::new(8));
    }

    #[test]
    fn orders_by_inner_value() {
        // 大小比較（< / >）が内部 u64 の自然順に従うことを確認する
        assert!(ByteOffset::new(1) < ByteOffset::new(2));
        assert!(ByteOffset::new(3) > ByteOffset::new(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        // 順不同の配列を sort() すると内部 u64 の昇順に並ぶことを確認する
        let mut offsets = [
            ByteOffset::new(3),
            ByteOffset::new(1),
            ByteOffset::new(2),
        ];
        offsets.sort();
        assert_eq!(
            offsets,
            [
                ByteOffset::new(1),
                ByteOffset::new(2),
                ByteOffset::new(3),
            ]
        );
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // Copy セマンティクスにより、別変数へ複製した後も元の変数が引き続き使用可能なことを確認する
        let original = ByteOffset::new(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        // HashMap のキーとして機能し、同値キーで挿入した値を取得できることを確認する
        let mut map = HashMap::new();
        map.insert(ByteOffset::new(10), "ten");
        assert_eq!(map.get(&ByteOffset::new(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値を HashSet に 2 回挿入しても等価キーが 1 件に畳まれることを確認する
        let mut set = HashSet::new();
        set.insert(ByteOffset::new(3));
        set.insert(ByteOffset::new(3));
        assert_eq!(set.len(), 1);
    }
}
