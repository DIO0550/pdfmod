//! PDF の辞書オブジェクト（dictionary）を表す `PdfDictionary` を定義するモジュール。
//!
//! キーは `PdfName`（#261）、値は `PdfObject`（#262）。内部表現は
//! `BTreeMap<PdfName, PdfObject>` で、キーがソート順に並ぶため出力が決定的になり
//! テストが安定する（`HashMap` の順序非決定・`Vec` の O(n) ルックアップは不採用）。
//! 後続の `PdfObject` 辞書ケース（#265）や `PdfStream`（#267）の辞書部の基盤となる。
//!
//! 生成・挿入は無検証（infallible）。null エントリの正規化や妥当性検証は
//! 上位（lexer/parser）の責務であり、本型はストレージ + アクセサのみを担う。
//!
//! 本モジュールは Issue #264（Phase R0）で追加された PDF オブジェクト層の基盤型。

use std::collections::BTreeMap;

use crate::object::{name::PdfName, pdf_object::PdfObject};

/// PDF 辞書オブジェクト。`PdfName` をキー、`PdfObject` を値とするマップのラッパ。
///
/// 内部は `BTreeMap<PdfName, PdfObject>`（ヒープ保持のため `Copy` 不可・`Clone` のみ）。
/// `Eq` は値型 `PdfObject` が `Real(f64)`（`NaN != NaN`）のため `Eq` を実装しておらず、
/// `PdfDictionary` にも `Eq` は付与できない。等価比較は `PartialEq` で行う。
#[derive(Debug, Clone, PartialEq, Default)]
pub struct PdfDictionary(BTreeMap<PdfName, PdfObject>);

impl PdfDictionary {
    /// 空の辞書を生成する（`Default` と同じ。明示構築用に併設）。
    pub fn new() -> PdfDictionary {
        PdfDictionary(BTreeMap::new())
    }

    /// キーに対応する値への参照を取り出す。未登録なら `None`（`Result` ではなく `Option`）。
    pub fn get(&self, key: &PdfName) -> Option<&PdfObject> {
        self.0.get(key)
    }

    /// キーと値を挿入する。既存キーなら値を上書きし、旧値を `Some(old)` で返す
    /// （新規キーなら `None`。std `BTreeMap::insert` と同セマンティクス）。
    pub fn insert(&mut self, key: PdfName, value: PdfObject) -> Option<PdfObject> {
        self.0.insert(key, value)
    }

    /// 登録エントリ件数を返す。
    pub fn len(&self) -> usize {
        self.0.len()
    }

    /// 辞書が空（件数 0）かどうかを返す。
    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    /// 指定キーが登録済みかどうかを返す。
    pub fn contains_key(&self, key: &PdfName) -> bool {
        self.0.contains_key(key)
    }

    /// キーに対応するエントリを削除し、削除した値を返す。
    /// 未登録なら `None`（`Result` ではなく `Option`。std `BTreeMap::remove` と同セマンティクス）。
    pub fn remove(&mut self, key: &PdfName) -> Option<PdfObject> {
        self.0.remove(key)
    }

    /// 全キーをキーのソート順（`BTreeMap` の昇順）で走査するイテレータを返す。
    pub fn keys(&self) -> impl Iterator<Item = &PdfName> {
        self.0.keys()
    }

    /// 全 `(キー, 値)` ペアをキーのソート順（`BTreeMap` の昇順）で走査するイテレータを返す。
    pub fn iter(&self) -> impl Iterator<Item = (&PdfName, &PdfObject)> {
        self.0.iter()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_creates_empty_dictionary() {
        // new() で生成した辞書は要素 0 件かつ空（len()==0 / is_empty()==true）であることを確認する
        let dict = PdfDictionary::new();
        assert_eq!(dict.len(), 0);
        assert!(dict.is_empty());
    }

    #[test]
    fn default_creates_empty_dictionary_same_as_new() {
        // default() で生成した辞書も new() と同じく空であり、両者が等価であることを確認する
        let dict = PdfDictionary::default();
        assert_eq!(dict.len(), 0);
        assert!(dict.is_empty());
        assert_eq!(dict, PdfDictionary::new());
    }

    #[test]
    fn get_returns_some_reference_after_insert() {
        // 1 件 insert した後、同じキーで get すると挿入した値への参照 Some(&value) が返ることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(42));
        assert_eq!(
            dict.get(&PdfName::from("Type")),
            Some(&PdfObject::Integer(42))
        );
    }

    #[test]
    fn insert_returns_none_for_new_key() {
        // 未登録キーへの insert は旧値が無いため戻り値 None を返すことを確認する
        let mut dict = PdfDictionary::new();
        let prev = dict.insert(PdfName::from("Type"), PdfObject::Boolean(true));
        assert_eq!(prev, None);
    }

    #[test]
    fn len_and_is_empty_reflect_multiple_inserts() {
        // 異なるキーで複数件 insert すると len() が件数を反映し is_empty() が false になることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("A"), PdfObject::Integer(1));
        dict.insert(PdfName::from("B"), PdfObject::Integer(2));
        assert_eq!(dict.len(), 2);
        assert!(!dict.is_empty());
    }

    #[test]
    fn contains_key_returns_true_for_inserted_key() {
        // insert 済みのキーで contains_key を呼ぶと true を返すことを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Null);
        assert!(dict.contains_key(&PdfName::from("Type")));
    }

    #[test]
    fn single_insert_transitions_len_and_is_empty() {
        // 空辞書に 1 件 insert すると len() が 0→1、is_empty() が true→false に遷移することを確認する
        let mut dict = PdfDictionary::new();
        assert_eq!(dict.len(), 0);
        assert!(dict.is_empty());
        dict.insert(PdfName::from("Key"), PdfObject::Integer(1));
        assert_eq!(dict.len(), 1);
        assert!(!dict.is_empty());
    }

    #[test]
    fn get_returns_none_for_absent_key() {
        // 一度も挿入していないキーで get すると None を返すことを確認する
        let dict = PdfDictionary::new();
        assert_eq!(dict.get(&PdfName::from("Missing")), None);
    }

    #[test]
    fn contains_key_returns_false_for_absent_key() {
        // 未登録キーで contains_key を呼ぶと false を返すことを確認する
        let dict = PdfDictionary::new();
        assert!(!dict.contains_key(&PdfName::from("Missing")));
    }

    #[test]
    fn stores_and_retrieves_different_value_variants() {
        // 別キーに Integer/Real/Boolean/Name を insert し、各キーの get が挿入バリアントを
        // Some(&value) で返す（値型に依存せず格納できる）ことを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Int"), PdfObject::Integer(7));
        dict.insert(PdfName::from("Real"), PdfObject::Real(1.5));
        dict.insert(PdfName::from("Bool"), PdfObject::Boolean(false));
        dict.insert(PdfName::from("Name"), PdfObject::Name(PdfName::from("Sub")));
        assert_eq!(
            dict.get(&PdfName::from("Int")),
            Some(&PdfObject::Integer(7))
        );
        assert_eq!(
            dict.get(&PdfName::from("Real")),
            Some(&PdfObject::Real(1.5))
        );
        assert_eq!(
            dict.get(&PdfName::from("Bool")),
            Some(&PdfObject::Boolean(false))
        );
        assert_eq!(
            dict.get(&PdfName::from("Name")),
            Some(&PdfObject::Name(PdfName::from("Sub")))
        );
    }

    #[test]
    fn multiple_inserts_keep_len_get_contains_consistent() {
        // 3 件以上の異なるキーを insert し、len()==件数・全キーで get=Some・
        // contains_key=true が一貫することを確認する
        let mut dict = PdfDictionary::new();
        let entries = [
            (PdfName::from("A"), PdfObject::Integer(1)),
            (PdfName::from("B"), PdfObject::Integer(2)),
            (PdfName::from("C"), PdfObject::Integer(3)),
            (PdfName::from("D"), PdfObject::Integer(4)),
        ];
        for (key, value) in &entries {
            dict.insert(key.clone(), value.clone());
        }
        assert_eq!(dict.len(), entries.len());
        for (key, value) in &entries {
            assert_eq!(dict.get(key), Some(value));
            assert!(dict.contains_key(key));
        }
    }

    #[test]
    fn equal_regardless_of_insertion_order() {
        // 同じ (key, value) 集合（有限値のみ）を異なる挿入順で構築した 2 辞書が
        // PartialEq で等価になる（挿入順に依存しない）ことを確認する
        let mut a = PdfDictionary::new();
        a.insert(PdfName::from("A"), PdfObject::Integer(1));
        a.insert(PdfName::from("B"), PdfObject::Real(2.5));
        let mut b = PdfDictionary::new();
        b.insert(PdfName::from("B"), PdfObject::Real(2.5));
        b.insert(PdfName::from("A"), PdfObject::Integer(1));
        assert_eq!(a, b);
    }

    #[test]
    fn reinsert_same_key_value_returns_some_and_keeps_len() {
        // 同一キーへ同値を 2 回 insert すると 2 回目の戻り値が Some(value)（同値で上書き）になり
        // len() が不変であることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(1));
        let prev = dict.insert(PdfName::from("Type"), PdfObject::Integer(1));
        assert_eq!(prev, Some(PdfObject::Integer(1)));
        assert_eq!(dict.len(), 1);
    }

    #[test]
    fn clone_is_independent_and_equal() {
        // エントリを挿入した辞書を clone すると複製が元と == で等価になり、
        // 複製でも get でエントリを取得できることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(99));
        let cloned = dict.clone();
        assert_eq!(cloned, dict);
        assert_eq!(
            cloned.get(&PdfName::from("Type")),
            Some(&PdfObject::Integer(99))
        );
    }

    #[test]
    fn reinsert_same_key_overwrites_and_returns_old_value() {
        // 同一キーへ 2 回目 insert(key, v2) すると戻り値が旧値 Some(old)、get が新値 Some(&v2)、
        // len() が不変であることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(1));
        let prev = dict.insert(PdfName::from("Type"), PdfObject::Integer(2));
        assert_eq!(prev, Some(PdfObject::Integer(1)));
        assert_eq!(
            dict.get(&PdfName::from("Type")),
            Some(&PdfObject::Integer(2))
        );
        assert_eq!(dict.len(), 1);
    }

    #[test]
    fn overwrite_with_different_variant_returns_old_variant() {
        // insert(key, Integer) 後に insert(key, Boolean) すると戻り値が旧バリアント
        // Some(Integer(..))、get が新バリアント Some(&Boolean) になることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(10));
        let prev = dict.insert(PdfName::from("Type"), PdfObject::Boolean(true));
        assert_eq!(prev, Some(PdfObject::Integer(10)));
        assert_eq!(
            dict.get(&PdfName::from("Type")),
            Some(&PdfObject::Boolean(true))
        );
    }

    #[test]
    fn remove_returns_some_value_and_deletes_entry() {
        // insert 済みキーを remove すると削除値 Some(value) を返し、
        // その後 get=None / contains_key=false / len()が 1 減ることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(42));
        let removed = dict.remove(&PdfName::from("Type"));
        assert_eq!(removed, Some(PdfObject::Integer(42)));
        assert_eq!(dict.get(&PdfName::from("Type")), None);
        assert!(!dict.contains_key(&PdfName::from("Type")));
        assert_eq!(dict.len(), 0);
    }

    #[test]
    fn remove_returns_none_for_absent_key() {
        // 未登録キーを remove すると削除対象が無いため None を返し、len() が不変であることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(1));
        let removed = dict.remove(&PdfName::from("Missing"));
        assert_eq!(removed, None);
        assert_eq!(dict.len(), 1);
    }

    #[test]
    fn keys_yields_all_keys_in_sorted_order() {
        // 挿入順と無関係に keys() が全キーを BTreeMap のソート順（昇順）で返すことを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("C"), PdfObject::Integer(3));
        dict.insert(PdfName::from("A"), PdfObject::Integer(1));
        dict.insert(PdfName::from("B"), PdfObject::Integer(2));
        let keys: Vec<&PdfName> = dict.keys().collect();
        assert_eq!(
            keys,
            vec![
                &PdfName::from("A"),
                &PdfName::from("B"),
                &PdfName::from("C")
            ]
        );
    }

    #[test]
    fn keys_yields_nothing_for_empty_dictionary() {
        // 空辞書では keys() が 1 件も列挙しない（count()==0）ことを確認する
        let dict = PdfDictionary::new();
        assert_eq!(dict.keys().count(), 0);
    }

    #[test]
    fn iter_yields_all_entries_in_sorted_key_order() {
        // 挿入順と無関係に iter() が全 (キー, 値) ペアをキーのソート順（昇順）で返すことを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("B"), PdfObject::Real(2.5));
        dict.insert(PdfName::from("A"), PdfObject::Integer(1));
        let entries: Vec<(&PdfName, &PdfObject)> = dict.iter().collect();
        assert_eq!(
            entries,
            vec![
                (&PdfName::from("A"), &PdfObject::Integer(1)),
                (&PdfName::from("B"), &PdfObject::Real(2.5)),
            ]
        );
    }

    #[test]
    fn iter_yields_nothing_for_empty_dictionary() {
        // 空辞書では iter() が 1 件も列挙しない（count()==0）ことを確認する
        let dict = PdfDictionary::new();
        assert_eq!(dict.iter().count(), 0);
    }
}
