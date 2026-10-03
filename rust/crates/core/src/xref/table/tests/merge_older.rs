use super::super::*;
use crate::byte_offset::ByteOffset;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

#[test]
fn keeps_newer_entries_of_each_kind_and_adds_older_only_entries() {
    let free = XRefEntry::Free {
        next_free_object: FreeObjectNumber::new(0),
        generation: GenerationNumber::new(1),
    };
    let in_use = XRefEntry::InUse {
        offset: ByteOffset::new(100),
        generation: GenerationNumber::new(0),
    };
    let compressed = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(8).unwrap(),
        index_in_stream: 2,
    };
    let mut newer = XRefTable::new();
    let mut older = XRefTable::new();
    for (number, current, previous) in [
        (1, free, in_use),
        (2, in_use, compressed),
        (3, compressed, free),
    ] {
        newer.insert(ObjectNumber::new(number).unwrap(), current);
        older.insert(ObjectNumber::new(number).unwrap(), previous);
    }
    older.insert(ObjectNumber::new(4).unwrap(), in_use);

    newer.merge_older(older);

    assert_eq!(newer.len(), 4);
    for (number, expected) in [(1, free), (2, in_use), (3, compressed), (4, in_use)] {
        assert_eq!(
            newer.get(ObjectNumber::new(number).unwrap()),
            Some(&expected)
        );
    }
}
