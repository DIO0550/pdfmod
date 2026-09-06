use super::super::*;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

// 自分自身を次の空き番号として指す free エントリ（辿ると無限ループするフリーリスト）でも
// 登録・取得できることを確認する。鎖の追跡と循環検出は解決層の責務。
#[test]
fn free_entry_may_point_to_itself() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::Free {
        next_free_object: FreeObjectNumber::new(3),
        generation: GenerationNumber::new(0),
    };

    table.insert(ObjectNumber::new(3).expect("positive object number"), entry);

    assert_eq!(
        table.get(ObjectNumber::new(3).expect("positive object number")),
        Some(&entry)
    );
}

// 自分自身を親 ObjStm として指すエントリ（解決すると循環する）でも
// 登録・取得できることを確認する。循環検出は解決層の責務。
#[test]
fn in_object_stream_entry_may_point_to_itself_as_parent() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(7).expect("positive object number"),
        index_in_stream: 0,
    };

    table.insert(ObjectNumber::new(7).expect("positive object number"), entry);

    assert_eq!(
        table.get(ObjectNumber::new(7).expect("positive object number")),
        Some(&entry)
    );
}

// free エントリが未登録の番号を指していても、登録側は成功することを確認する。
// 「次の空き番号」を引くと None になるだけで、テーブルは鎖の切断を検出しない。
#[test]
fn free_entry_may_point_to_unregistered_object_number() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::Free {
        next_free_object: FreeObjectNumber::new(99),
        generation: GenerationNumber::new(0),
    };

    assert!(table.insert(ObjectNumber::new(1).expect("positive object number"), entry));
    assert_eq!(
        table.get(ObjectNumber::new(99).expect("positive object number")),
        None
    );
}
