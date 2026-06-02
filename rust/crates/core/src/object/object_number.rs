//! PDF の間接オブジェクトを識別するオブジェクト番号 `ObjectNumber` を定義するモジュール。
//!
//! 裸の `u64` と取り違えないための newtype。間接参照・xref エントリ・キャッシュキーの
//! 構成要素として用いる。生成は無検証（infallible）で、0 や `u64::MAX` も無条件に受理する。
//! 0（フリーリスト先頭の予約番号）の特別扱いは xref レイヤ（R2）に委譲する。

/// PDF オブジェクト番号。間接オブジェクトを一意に識別する非負整数のラッパ。
///
/// 内部表現は `u64`（spec §4.4 の u32 とは意図的に乖離。Issue #255 指定）。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは内部 `u64` の自然な振る舞いに従う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct ObjectNumber(u64);

impl ObjectNumber {
    /// 与えられた `u64` から `ObjectNumber` を生成する。
    ///
    /// 無検証（infallible）。0 や `u64::MAX` を含む任意の値を受理する。
    pub fn new(n: u64) -> ObjectNumber {
        ObjectNumber(n)
    }

    /// 内部のオブジェクト番号を `u64` として取り出す。
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
        for n in [0, 1, 42, u64::MAX] {
            assert_eq!(ObjectNumber::new(n).value(), n);
        }
    }

    #[test]
    fn accepts_zero() {
        assert_eq!(ObjectNumber::new(0).value(), 0);
    }

    #[test]
    fn accepts_one() {
        assert_eq!(ObjectNumber::new(1).value(), 1);
    }

    #[test]
    fn accepts_u64_max() {
        assert_eq!(ObjectNumber::new(u64::MAX).value(), u64::MAX);
    }

    #[test]
    fn equal_numbers_are_equal() {
        assert_eq!(ObjectNumber::new(7), ObjectNumber::new(7));
    }

    #[test]
    fn different_numbers_are_not_equal() {
        assert_ne!(ObjectNumber::new(7), ObjectNumber::new(8));
    }

    #[test]
    fn orders_by_inner_value() {
        assert!(ObjectNumber::new(1) < ObjectNumber::new(2));
        assert!(ObjectNumber::new(3) > ObjectNumber::new(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        let mut numbers = [
            ObjectNumber::new(3),
            ObjectNumber::new(1),
            ObjectNumber::new(2),
        ];
        numbers.sort();
        assert_eq!(
            numbers,
            [
                ObjectNumber::new(1),
                ObjectNumber::new(2),
                ObjectNumber::new(3),
            ]
        );
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        let original = ObjectNumber::new(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        let mut map = HashMap::new();
        map.insert(ObjectNumber::new(10), "ten");
        assert_eq!(map.get(&ObjectNumber::new(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        let mut set = HashSet::new();
        set.insert(ObjectNumber::new(3));
        set.insert(ObjectNumber::new(3));
        assert_eq!(set.len(), 1);
    }
}
