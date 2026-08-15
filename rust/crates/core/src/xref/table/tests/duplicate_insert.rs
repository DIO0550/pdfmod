use super::super::*;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

// 同じオブジェクト番号への 2 回目の挿入は false を返し、値は上書きされないことを確認する。
#[test]
fn second_insert_for_same_object_number_is_ignored() {
    let mut table = XRefTable::new();
    let newer = XRefEntry::InUse {
        offset: ByteOffset::new(100),
        generation: GenerationNumber::new(1),
    };
    let older = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };

    assert!(table.insert(ObjectNumber::new(1), newer));
    assert!(!table.insert(ObjectNumber::new(1), older));
    assert_eq!(table.get(ObjectNumber::new(1)), Some(&newer));
}

// 再挿入が無視されても件数は増えないことを確認する。
#[test]
fn ignored_insert_does_not_increase_len() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };

    table.insert(ObjectNumber::new(1), entry);
    table.insert(ObjectNumber::new(1), entry);

    assert_eq!(table.len(), 1);
}

// バリアントが違っても（Free で上書きしようとしても）先勝ちが守られることを確認する。
#[test]
fn first_insert_wins_across_different_variants() {
    let mut table = XRefTable::new();
    let in_use = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };
    let free = XRefEntry::Free {
        next_free_object: ObjectNumber::new(0),
        generation: GenerationNumber::new(1),
    };

    table.insert(ObjectNumber::new(1), in_use);
    assert!(!table.insert(ObjectNumber::new(1), free));
    assert_eq!(table.get(ObjectNumber::new(1)), Some(&in_use));
}
