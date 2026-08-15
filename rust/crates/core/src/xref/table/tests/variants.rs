use super::super::*;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

// Free / InUse / InObjectStream の 3 バリアントを同じテーブルに入れ、
// それぞれが挿入時と同じ値で引けることを確認する。
#[test]
fn all_three_variants_roundtrip_through_table() {
    let mut table = XRefTable::new();
    let free = XRefEntry::Free {
        next_free_object: ObjectNumber::new(0),
        generation: GenerationNumber::new(65535),
    };
    let in_use = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };
    let in_object_stream = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(5),
        index_in_stream: 3,
    };

    table.insert(ObjectNumber::new(0), free);
    table.insert(ObjectNumber::new(1), in_use);
    table.insert(ObjectNumber::new(2), in_object_stream);

    assert_eq!(table.get(ObjectNumber::new(0)), Some(&free));
    assert_eq!(table.get(ObjectNumber::new(1)), Some(&in_use));
    assert_eq!(table.get(ObjectNumber::new(2)), Some(&in_object_stream));
    assert_eq!(table.len(), 3);
}
