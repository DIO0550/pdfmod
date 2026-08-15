use super::super::*;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

// 挿入したエントリが同じオブジェクト番号で引けることを確認する。
#[test]
fn inserted_entry_is_retrievable_by_object_number() {
    let mut table = XRefTable::new();
    let entry = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };

    assert!(table.insert(ObjectNumber::new(1), entry));
    assert_eq!(table.get(ObjectNumber::new(1)), Some(&entry));
}

// 挿入していないオブジェクト番号は None になることを確認する。
#[test]
fn unregistered_object_number_returns_none() {
    let mut table = XRefTable::new();
    table.insert(
        ObjectNumber::new(1),
        XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        },
    );

    assert_eq!(table.get(ObjectNumber::new(2)), None);
}

// 異なるオブジェクト番号を複数挿入すると件数がその分だけ増えることを確認する。
#[test]
fn inserting_distinct_object_numbers_increases_len() {
    let mut table = XRefTable::new();

    for n in [1u64, 2, 3] {
        table.insert(
            ObjectNumber::new(n),
            XRefEntry::InUse {
                offset: ByteOffset::new(n * 100),
                generation: GenerationNumber::new(0),
            },
        );
    }

    assert_eq!(table.len(), 3);
    assert!(!table.is_empty());
}

// オブジェクト番号が疎（0 と u64::MAX が同居）でも両方引けることを確認する。
#[test]
fn sparse_object_numbers_are_both_retrievable() {
    let mut table = XRefTable::new();
    let head = XRefEntry::Free {
        next_free_object: ObjectNumber::new(0),
        generation: GenerationNumber::new(65535),
    };
    let far = XRefEntry::InUse {
        offset: ByteOffset::new(1),
        generation: GenerationNumber::new(0),
    };

    table.insert(ObjectNumber::new(0), head);
    table.insert(ObjectNumber::new(u64::MAX), far);

    assert_eq!(table.get(ObjectNumber::new(0)), Some(&head));
    assert_eq!(table.get(ObjectNumber::new(u64::MAX)), Some(&far));
    assert_eq!(table.len(), 2);
}

// 重複を含む多数の挿入でも、件数が一意なオブジェクト番号の数と一致することを確認する。
// 1000 回挿入するが番号は 0..500 の 500 種類しかない。
#[test]
fn len_counts_distinct_object_numbers_only() {
    let mut table = XRefTable::new();

    for n in 0..1000u64 {
        table.insert(
            ObjectNumber::new(n % 500),
            XRefEntry::InUse {
                offset: ByteOffset::new(n),
                generation: GenerationNumber::new(0),
            },
        );
    }

    assert_eq!(table.len(), 500);
}
