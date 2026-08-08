//! PDF の間接オブジェクトを一意に識別する複合キー `ObjectId` を定義するモジュール。
//!
//! オブジェクト番号 `ObjectNumber`（#255）と世代番号 `GenerationNumber`（#256）の組を
//! 束ねた値ラッパ。xref エントリのキー・リゾルバのキャッシュキー
//! （`HashMap<ObjectId, PdfObject>` 等）・循環参照検出の集合キー（`HashSet<ObjectId>`）の
//! 構成要素として用いる。生成は無検証（infallible）で、任意の番号・世代の組を無条件に受理する。
//! 世代不一致・番号の妥当性検証は xref レイヤ（R2）に委譲する。

use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

/// PDF 間接オブジェクトの複合識別子。オブジェクト番号と世代番号の組で一意に識別する。
///
/// `object_number` を先に宣言することで、`PartialOrd`/`Ord` が
/// 「object_number を第 1 キー、generation_number を第 2 キー」とする辞書順になる。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは両フィールド（内部の `u64`/`u16`）に依存する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct ObjectId {
    object_number: ObjectNumber,
    generation_number: GenerationNumber,
}

impl ObjectId {
    /// オブジェクト番号と世代番号から `ObjectId` を生成する。
    ///
    /// 無検証（infallible）。任意の `(ObjectNumber, GenerationNumber)` の組を受理する。
    pub fn new(object_number: ObjectNumber, generation_number: GenerationNumber) -> ObjectId {
        ObjectId {
            object_number,
            generation_number,
        }
    }

    /// オブジェクト番号を `Copy` で取り出す。
    pub fn object_number(&self) -> ObjectNumber {
        self.object_number
    }

    /// 世代番号を `Copy` で取り出す。
    pub fn generation_number(&self) -> GenerationNumber {
        self.generation_number
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::{HashMap, HashSet};

    #[test]
    fn new_then_accessors_roundtrip() {
        // 代表ペアで `new` に包んだ値を 2 アクセサで取り出すと入力と一致する（ラウンドトリップ・無損失）。
        for (n, g) in [(0u64, 0u16), (1, 1), (42, 42), (u64::MAX, u16::MAX)] {
            let id = ObjectId::new(ObjectNumber::new(n), GenerationNumber::new(g));
            assert_eq!(id.object_number(), ObjectNumber::new(n));
            assert_eq!(id.generation_number(), GenerationNumber::new(g));
        }
    }

    #[test]
    fn equal_when_both_fields_match() {
        // object_number・generation_number がともに同一なら等価（Eq が両フィールドに委譲）。
        let a = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(0));
        let b = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(0));
        assert_eq!(a, b);
    }

    #[test]
    fn not_equal_when_generation_differs() {
        // object_number 同一・generation_number のみ異なれば非等価（片フィールド依存でないことを保証）。
        let a = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(0));
        let b = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(1));
        assert_ne!(a, b);
    }

    #[test]
    fn not_equal_when_object_number_differs() {
        // generation_number 同一・object_number のみ異なれば非等価（両フィールド依存の裏付け）。
        let a = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(0));
        let b = ObjectId::new(ObjectNumber::new(6), GenerationNumber::new(0));
        assert_ne!(a, b);
    }

    #[test]
    fn orders_by_object_number_first() {
        // 辞書順は object_number を第 1 キーとする（generation_number に関わらず object_number が小さい方が小）。
        let small = ObjectId::new(ObjectNumber::new(1), GenerationNumber::new(9));
        let large = ObjectId::new(ObjectNumber::new(2), GenerationNumber::new(0));
        assert!(small < large);
        assert!(large > small);
    }

    #[test]
    fn orders_by_generation_when_object_number_equal() {
        // object_number 同一時は第 2 キー generation_number で大小が決まる。
        let small = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(1));
        let large = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(2));
        assert!(small < large);
        assert!(large > small);
    }

    #[test]
    fn sorts_in_lexicographic_order() {
        // `sort()` すると Ord の 2 軸（object_number 優先 → generation_number）で辞書順に並ぶ。
        let mut ids = [
            ObjectId::new(ObjectNumber::new(2), GenerationNumber::new(0)),
            ObjectId::new(ObjectNumber::new(1), GenerationNumber::new(5)),
            ObjectId::new(ObjectNumber::new(1), GenerationNumber::new(2)),
        ];
        ids.sort();
        assert_eq!(
            ids,
            [
                ObjectId::new(ObjectNumber::new(1), GenerationNumber::new(2)),
                ObjectId::new(ObjectNumber::new(1), GenerationNumber::new(5)),
                ObjectId::new(ObjectNumber::new(2), GenerationNumber::new(0)),
            ]
        );
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // `Copy` のため代入でコピーされ、元値も使用可能でコピーと等価。
        let id = ObjectId::new(ObjectNumber::new(7), GenerationNumber::new(3));
        let copied = id;
        assert_eq!(id.object_number(), ObjectNumber::new(7));
        assert_eq!(id.generation_number(), GenerationNumber::new(3));
        assert_eq!(id, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        // `HashMap<ObjectId, _>` のキーとして使え、同値キーで挿入値を取得できる（Hash + Eq）。
        let mut map = HashMap::new();
        map.insert(
            ObjectId::new(ObjectNumber::new(10), GenerationNumber::new(0)),
            "obj10",
        );
        assert_eq!(
            map.get(&ObjectId::new(
                ObjectNumber::new(10),
                GenerationNumber::new(0)
            )),
            Some(&"obj10")
        );
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値 `ObjectId` を `HashSet` に 2 回挿入すると 1 件に折りたたまれる。
        let mut set = HashSet::new();
        set.insert(ObjectId::new(
            ObjectNumber::new(3),
            GenerationNumber::new(0),
        ));
        set.insert(ObjectId::new(
            ObjectNumber::new(3),
            GenerationNumber::new(0),
        ));
        assert_eq!(set.len(), 1);
    }

    #[test]
    fn distinct_keys_coexist_in_hash_set() {
        // object_number 同一・generation 違いの 2 値は別キーとして `HashSet` に共存する（両フィールド依存）。
        let mut set = HashSet::new();
        set.insert(ObjectId::new(
            ObjectNumber::new(7),
            GenerationNumber::new(0),
        ));
        set.insert(ObjectId::new(
            ObjectNumber::new(7),
            GenerationNumber::new(1),
        ));
        assert_eq!(set.len(), 2);
    }

    #[test]
    fn accepts_min_boundary_combo() {
        // 最小境界の組 `(0, 0)` を無検証で受理し、アクセサが `0`/`0` を返す。
        let id = ObjectId::new(ObjectNumber::new(0), GenerationNumber::new(0));
        assert_eq!(id.object_number().value(), 0);
        assert_eq!(id.generation_number().value(), 0);
    }

    #[test]
    fn accepts_max_boundary_combo() {
        // 最大境界の組 `(u64::MAX, u16::MAX)` を無検証で受理し、アクセサが各境界値を返す。
        let id = ObjectId::new(ObjectNumber::new(u64::MAX), GenerationNumber::new(u16::MAX));
        assert_eq!(id.object_number().value(), u64::MAX);
        assert_eq!(id.generation_number().value(), u16::MAX);
    }

    #[test]
    fn accepts_mixed_boundary_combo() {
        // 片フィールドのみ MAX の組（`(u64::MAX,0)` と `(0,u16::MAX)`）を受理し、双方は非等価。
        let obj_max = ObjectId::new(ObjectNumber::new(u64::MAX), GenerationNumber::new(0));
        let gen_max = ObjectId::new(ObjectNumber::new(0), GenerationNumber::new(u16::MAX));
        assert_eq!(obj_max.object_number().value(), u64::MAX);
        assert_eq!(obj_max.generation_number().value(), 0);
        assert_eq!(gen_max.object_number().value(), 0);
        assert_eq!(gen_max.generation_number().value(), u16::MAX);
        assert_ne!(obj_max, gen_max);
    }
}
