use super::super::*;

// 典型的な in-use エントリ（オフセット 17 / 世代 0）を構築し、往復することを確認する。
#[test]
fn in_use_entry_roundtrips_offset_and_generation() {
    let entry = XRefEntry::InUse {
        offset: ByteOffset::new(17),
        generation: GenerationNumber::new(0),
    };

    let XRefEntry::InUse { offset, generation } = entry else {
        panic!("InUse バリアントであるべき");
    };

    assert_eq!(offset, ByteOffset::new(17));
    assert_eq!(generation, GenerationNumber::new(0));
}

// オフセット 0（ファイル先頭）・u64::MAX などの境界値でも往復することを確認する。
#[test]
fn in_use_entry_roundtrips_boundary_values() {
    for (offset, gen) in [(0u64, 0u16), (1, 1), (u64::MAX, u16::MAX)] {
        let entry = XRefEntry::InUse {
            offset: ByteOffset::new(offset),
            generation: GenerationNumber::new(gen),
        };

        let XRefEntry::InUse {
            offset: o,
            generation: g,
        } = entry
        else {
            panic!("InUse バリアントであるべき");
        };

        assert_eq!(o.value(), offset);
        assert_eq!(g.value(), gen);
    }
}
