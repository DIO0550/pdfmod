use super::super::*;

// 典型的な圧縮エントリ（親 ObjStm = 5 / インデックス = 3）を構築し、往復することを確認する。
#[test]
fn in_object_stream_roundtrips_stream_object_and_index() {
    let entry = XRefEntry::InObjectStream {
        stream_object: ObjectNumber::new(5),
        index_in_stream: 3,
    };

    let XRefEntry::InObjectStream {
        stream_object,
        index_in_stream,
    } = entry
    else {
        panic!("InObjectStream バリアントであるべき");
    };

    assert_eq!(stream_object, ObjectNumber::new(5));
    assert_eq!(index_in_stream, 3);
}

// インデックス 0（ストリーム先頭）・u32::MAX の境界値でも往復することを確認する。
#[test]
fn in_object_stream_roundtrips_boundary_values() {
    for (stream, index) in [(0u64, 0u32), (1, 1), (u64::MAX, u32::MAX)] {
        let entry = XRefEntry::InObjectStream {
            stream_object: ObjectNumber::new(stream),
            index_in_stream: index,
        };

        let XRefEntry::InObjectStream {
            stream_object,
            index_in_stream,
        } = entry
        else {
            panic!("InObjectStream バリアントであるべき");
        };

        assert_eq!(stream_object.value(), stream);
        assert_eq!(index_in_stream, index);
    }
}
