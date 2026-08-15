use super::super::*;

// 同じバリアント・同じフィールド値なら等しいことを確認する。
#[test]
fn same_variant_with_same_fields_are_equal() {
    let a = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };
    let b = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };

    assert_eq!(a, b);
}

// フィールド値が 1 つでも違えば等しくないことを確認する。
#[test]
fn same_variant_with_different_fields_are_not_equal() {
    let a = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };
    let b = XRefEntry::InUse {
        offset: ByteOffset::new(18),
        generation: GenerationNumber::new(0),
    };

    assert_ne!(a, b);
}

// 内部の数値表現が同じでもバリアントが違えば等しくないことを確認する。
#[test]
fn different_variants_are_not_equal() {
    let free = XRefEntry::Free {
        next_free_object: ObjectNumber::new(5),
        generation: GenerationNumber::new(0),
    };
    let in_object_stream = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(5),
        index_in_stream: 0,
    };

    assert_ne!(free, in_object_stream);
}

// Copy であること（ムーブせずに複製されること）を確認する。
#[test]
fn entry_is_copy() {
    let original = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(5),
        index_in_stream: 3,
    };
    let copied = original;

    assert_eq!(original, copied);
}
