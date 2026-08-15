use super::super::*;
use crate::object::object_number::ObjectNumber;

// new() で生成した直後は件数 0 かつ空であることを確認する。
#[test]
fn new_table_is_empty() {
    let table = XRefTable::new();

    assert_eq!(table.len(), 0);
    assert!(table.is_empty());
}

// Default が new() と同じ空テーブルを作ることを確認する。
#[test]
fn default_table_equals_new_table() {
    assert_eq!(XRefTable::default(), XRefTable::new());
}

// 空テーブルからは任意のオブジェクト番号で None が返ることを確認する。
#[test]
fn empty_table_returns_none_for_any_object_number() {
    let table = XRefTable::new();

    for n in [0u64, 1, 42, u64::MAX] {
        assert_eq!(table.get(ObjectNumber::new(n)), None);
    }
}
