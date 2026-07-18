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
        // new(n) で包んだ値を value() で取り出すと入力 n と一致する。
        // 代表値 [0, 1, 42, u16::MAX] で生成と取り出しが無損失（ラウンドトリップ）であることを確認する。
        for n in [0, 1, 42, u16::MAX] {
            assert_eq!(GenerationNumber::new(n).value(), n);
        }
    }

    #[test]
    fn accepts_zero() {
        // 0（フリーオブジェクトの予約世代）を無検証で受理し、value() が 0 を返す。
        assert_eq!(GenerationNumber::new(0).value(), 0);
    }

    #[test]
    fn accepts_one() {
        // 1（最小の「使用中」通常世代）を受理し、value() が 1 を返す。
        assert_eq!(GenerationNumber::new(1).value(), 1);
    }

    #[test]
    fn accepts_u16_max() {
        // u16::MAX（= 65535、ISO 32000-1 §7.5.4 の世代上限）を受理し、範囲上限を取り出せる。
        assert_eq!(GenerationNumber::new(u16::MAX).value(), u16::MAX);
    }

    #[test]
    fn equal_numbers_are_equal() {
        // 同じ u16 から生成した 2 値は == で等価になる（PartialEq/Eq が内部値に委譲）。
        assert_eq!(GenerationNumber::new(7), GenerationNumber::new(7));
    }

    #[test]
    fn different_numbers_are_not_equal() {
        // 異なる u16 から生成した 2 値は != で非等価になる。
        assert_ne!(GenerationNumber::new(7), GenerationNumber::new(8));
    }

    #[test]
    fn orders_by_inner_value() {
        // < / > による大小比較が内部 u16 の大小と一致する（PartialOrd/Ord が内部値に委譲）。
        assert!(GenerationNumber::new(1) < GenerationNumber::new(2));
        assert!(GenerationNumber::new(3) > GenerationNumber::new(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        // 配列を sort() すると内部 u16 の昇順に並ぶ（Ord により [3,1,2] → [1,2,3]）。
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
        // 代入でコピーしても元の値はムーブされず、コピーと等価のまま使い続けられる。
        let original = GenerationNumber::new(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        // HashMap のキーとして使え、同値キーで get すると挿入値を取得できる（Hash + Eq）。
        let mut map = HashMap::new();
        map.insert(GenerationNumber::new(10), "ten");
        assert_eq!(map.get(&GenerationNumber::new(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値を 2 回挿入しても要素数は 1 になる（同値が 1 つに折りたたまれる）。
        let mut set = HashSet::new();
        set.insert(GenerationNumber::new(3));
        set.insert(GenerationNumber::new(3));
        assert_eq!(set.len(), 1);
    }
}
