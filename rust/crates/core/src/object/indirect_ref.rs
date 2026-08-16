//! PDF の間接参照（`N G R`）を表す `IndirectRef` を定義するモジュール。
//!
//! `ObjectId`（#258）で参照先の間接オブジェクトを指す値ラッパ。後続の
//! オブジェクト解決（Epic R2）の入力となる土台を提供する。生成は無検証
//! （infallible）で、任意の `ObjectId`（境界値含む）を無条件に受理する。
//! 参照先の存在・世代の妥当性検証は xref レイヤ（R2）に委譲する。

use crate::object::object_id::ObjectId;

/// PDF の間接参照（`N G R`）。参照先を `ObjectId` で内包する値ラッパ。
///
/// `ObjectId` が `Copy` なので `IndirectRef` も `Copy`。等価・ハッシュは
/// 内包する `ObjectId`（その両フィールド `u64`/`u16`）に依存する。
/// 順序（`PartialOrd`/`Ord`）は付けない（`PdfObject` 自体が `Ord` 非実装で
/// `Reference` 経由ソートは不可能・単体ソート用途も現状なし。必要時に非破壊で追加可能）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[must_use]
pub struct IndirectRef {
    target: ObjectId,
}

impl IndirectRef {
    /// 参照先 `ObjectId` から `IndirectRef` を生成する。
    ///
    /// 無検証（infallible）。任意の `ObjectId` を受理する。
    pub fn new(target: ObjectId) -> Self {
        Self { target }
    }

    /// 参照先 `ObjectId` を `Copy` で取り出す。
    pub fn target(&self) -> ObjectId {
        self.target
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::object::generation_number::GenerationNumber;
    use crate::object::object_number::ObjectNumber;
    use std::collections::{HashMap, HashSet};

    #[test]
    fn new_then_target_roundtrips() {
        // 代表ペアで `ObjectId` を `new` に包み `target()` で取り出すと入力と一致する（ラウンドトリップ・無損失）。
        for (n, g) in [(0u64, 0u16), (1, 1), (42, 42)] {
            let target = ObjectId::new(ObjectNumber::new(n), GenerationNumber::new(g));
            let ir = IndirectRef::new(target);
            assert_eq!(ir.target(), target);
        }
    }

    #[test]
    fn target_reaches_object_number_and_generation_number() {
        // `target()` 経由で内包 `ObjectId` の object_number / generation_number に到達でき、入力と一致する。
        let target = ObjectId::new(ObjectNumber::new(7), GenerationNumber::new(3));
        let ir = IndirectRef::new(target);
        assert_eq!(ir.target().object_number(), ObjectNumber::new(7));
        assert_eq!(ir.target().generation_number(), GenerationNumber::new(3));
    }

    #[test]
    fn same_target_is_equal() {
        // 同一 `ObjectId` から生成した 2 つの `IndirectRef` は == で等価（Eq が内包 ObjectId に委譲）。
        let target = ObjectId::new(ObjectNumber::new(5), GenerationNumber::new(0));
        let a = IndirectRef::new(target);
        let b = IndirectRef::new(target);
        assert_eq!(a, b);
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // `Copy` のため代入でコピーされ、元値も使用可能でコピーと等価。
        let target = ObjectId::new(ObjectNumber::new(7), GenerationNumber::new(3));
        let ir = IndirectRef::new(target);
        let copied = ir;
        assert_eq!(ir.target(), target);
        assert_eq!(ir, copied);
    }

    #[test]
    fn debug_format_contains_type_name() {
        // `Debug` 出力に型名 `IndirectRef` を含む。
        let ir = IndirectRef::new(ObjectId::new(
            ObjectNumber::new(1),
            GenerationNumber::new(0),
        ));
        assert!(format!("{:?}", ir).contains("IndirectRef"));
    }

    #[test]
    fn works_as_hash_map_key() {
        // `HashMap<IndirectRef, _>` のキーとして使え、同値キーで挿入値を取得できる（Hash + Eq）。
        let target = ObjectId::new(ObjectNumber::new(10), GenerationNumber::new(0));
        let mut map = HashMap::new();
        map.insert(IndirectRef::new(target), "ref10");
        assert_eq!(map.get(&IndirectRef::new(target)), Some(&"ref10"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値 `IndirectRef` を `HashSet` に 2 回挿入すると 1 件に折りたたまれる。
        let target = ObjectId::new(ObjectNumber::new(3), GenerationNumber::new(0));
        let mut set = HashSet::new();
        set.insert(IndirectRef::new(target));
        set.insert(IndirectRef::new(target));
        assert_eq!(set.len(), 1);
    }

    #[test]
    fn distinct_keys_coexist_in_hash_set() {
        // 内包 `ObjectId` が異なる 3 値は別キーとして `HashSet` に共存する
        // （generation 差異・object_number 差異の両軸で Eq により区別される）。
        let mut set = HashSet::new();
        // object_number 同一・generation 差異
        set.insert(IndirectRef::new(ObjectId::new(
            ObjectNumber::new(7),
            GenerationNumber::new(0),
        )));
        set.insert(IndirectRef::new(ObjectId::new(
            ObjectNumber::new(7),
            GenerationNumber::new(1),
        )));
        // generation 同一・object_number 差異
        set.insert(IndirectRef::new(ObjectId::new(
            ObjectNumber::new(8),
            GenerationNumber::new(0),
        )));
        assert_eq!(set.len(), 3);
    }

    #[test]
    fn accepts_min_boundary_target() {
        // 最小境界 `(0, 0)` の `ObjectId` を無検証で受理し、ラウンドトリップが成立する。
        let target = ObjectId::new(ObjectNumber::new(0), GenerationNumber::new(0));
        let ir = IndirectRef::new(target);
        assert_eq!(ir.target(), target);
        assert_eq!(ir.target().object_number().value(), 0);
        assert_eq!(ir.target().generation_number().value(), 0);
    }

    #[test]
    fn accepts_max_boundary_target() {
        // 最大境界 `(u64::MAX, u16::MAX)` の `ObjectId` を無検証で受理し、ラウンドトリップが成立する。
        let target = ObjectId::new(ObjectNumber::new(u64::MAX), GenerationNumber::new(u16::MAX));
        let ir = IndirectRef::new(target);
        assert_eq!(ir.target(), target);
        assert_eq!(ir.target().object_number().value(), u64::MAX);
        assert_eq!(ir.target().generation_number().value(), u16::MAX);
    }

    #[test]
    fn not_equal_when_object_number_differs() {
        // 世代は同一・object_number のみ異なる 2 値は非等価（内包 ObjectId の差異が反映される）。
        let a = IndirectRef::new(ObjectId::new(
            ObjectNumber::new(5),
            GenerationNumber::new(0),
        ));
        let b = IndirectRef::new(ObjectId::new(
            ObjectNumber::new(6),
            GenerationNumber::new(0),
        ));
        assert_ne!(a, b);
    }

    #[test]
    fn not_equal_when_generation_number_differs() {
        // object_number は同一・generation_number のみ異なる 2 値は非等価（内包 ObjectId の差異が反映される）。
        let a = IndirectRef::new(ObjectId::new(
            ObjectNumber::new(5),
            GenerationNumber::new(0),
        ));
        let b = IndirectRef::new(ObjectId::new(
            ObjectNumber::new(5),
            GenerationNumber::new(1),
        ));
        assert_ne!(a, b);
    }
}
