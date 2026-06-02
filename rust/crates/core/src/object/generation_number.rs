//! PDF の間接オブジェクトの世代を表す世代番号 `GenerationNumber` を定義するモジュール。
//!
//! 裸の `u16` や隣接する `ObjectNumber` と取り違えないための newtype。
//! 間接参照・xref エントリ・`ObjectId`（#258）の構成要素として用いる。
//! 生成は無検証（infallible）で、0 や `u16::MAX`（= 65535）も無条件に受理する。
//! 0（フリーリスト先頭の予約世代）の特別扱い・世代不一致判定は xref レイヤ（後続）に委譲する。

/// PDF 世代番号。間接オブジェクトの世代（削除・再利用の管理）を表す整数のラッパ。
///
/// 内部表現は `u16`。仕様範囲 `0..=65535`（ISO 32000-1 §7.5.4）が `u16` の定義域と
/// 一致するため、型自体が仕様範囲を保証する（範囲外値は型レベルで表現不能）。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは内部 `u16` の自然な振る舞いに従う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct GenerationNumber(u16);

impl GenerationNumber {
    /// 与えられた `u16` から `GenerationNumber` を生成する。
    ///
    /// 無検証（infallible）。0 や `u16::MAX`（= 65535）を含む任意の値を受理する。
    pub fn new(n: u16) -> GenerationNumber {
        GenerationNumber(n)
    }

    /// 内部の世代番号を `u16` として取り出す。
    pub fn value(&self) -> u16 {
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
        for n in [0, 1, 42, u16::MAX] {
            assert_eq!(GenerationNumber::new(n).value(), n);
        }
    }

    #[test]
    fn accepts_zero() {
        assert_eq!(GenerationNumber::new(0).value(), 0);
    }

    #[test]
    fn accepts_one() {
        assert_eq!(GenerationNumber::new(1).value(), 1);
    }

    #[test]
    fn accepts_u16_max() {
        assert_eq!(GenerationNumber::new(u16::MAX).value(), u16::MAX);
    }

    #[test]
    fn equal_numbers_are_equal() {
        assert_eq!(GenerationNumber::new(7), GenerationNumber::new(7));
    }

    #[test]
    fn different_numbers_are_not_equal() {
        assert_ne!(GenerationNumber::new(7), GenerationNumber::new(8));
    }

    #[test]
    fn orders_by_inner_value() {
        assert!(GenerationNumber::new(1) < GenerationNumber::new(2));
        assert!(GenerationNumber::new(3) > GenerationNumber::new(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        let mut numbers = [
            GenerationNumber::new(3),
            GenerationNumber::new(1),
            GenerationNumber::new(2),
        ];
        numbers.sort();
        assert_eq!(
            numbers,
            [
                GenerationNumber::new(1),
                GenerationNumber::new(2),
                GenerationNumber::new(3),
            ]
        );
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        let original = GenerationNumber::new(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        let mut map = HashMap::new();
        map.insert(GenerationNumber::new(10), "ten");
        assert_eq!(map.get(&GenerationNumber::new(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        let mut set = HashSet::new();
        set.insert(GenerationNumber::new(3));
        set.insert(GenerationNumber::new(3));
        assert_eq!(set.len(), 1);
    }
}
