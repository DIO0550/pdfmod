use super::super::*;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

// 仕様上オブジェクト番号 0 は常にフリーリストの先頭（free）だが、
// テーブルは in-use エントリの登録を拒否しないことを確認する。
#[test]
fn object_number_zero_accepts_in_use_entry() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };

    assert!(table.insert(ObjectNumber::new(0), entry));
    assert_eq!(table.get(ObjectNumber::new(0)), Some(&entry));
}

// 自分自身を次の空き番号として指す free エントリ（辿ると無限ループするフリーリスト）でも
// 登録・取得できることを確認する。鎖の追跡と循環検出は解決層の責務。
#[test]
fn free_entry_may_point_to_itself() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::Free {
        next_free_object: ObjectNumber::new(3),
        generation: GenerationNumber::new(0),
    };

    table.insert(ObjectNumber::new(3), entry);

    assert_eq!(table.get(ObjectNumber::new(3)), Some(&entry));
}

// 自分自身を親 ObjStm として指すエントリ（解決すると循環する）でも
// 登録・取得できることを確認する。循環検出は解決層の責務。
#[test]
fn in_object_stream_entry_may_point_to_itself_as_parent() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(7),
        index_in_stream: 0,
    };

    table.insert(ObjectNumber::new(7), entry);

    assert_eq!(table.get(ObjectNumber::new(7)), Some(&entry));
}

// free エントリが未登録の番号を指していても、登録側は成功することを確認する。
// 「次の空き番号」を引くと None になるだけで、テーブルは鎖の切断を検出しない。
#[test]
fn free_entry_may_point_to_unregistered_object_number() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::Free {
        next_free_object: ObjectNumber::new(99),
        generation: GenerationNumber::new(0),
    };

    assert!(table.insert(ObjectNumber::new(1), entry));
    assert_eq!(table.get(ObjectNumber::new(99)), None);
}
