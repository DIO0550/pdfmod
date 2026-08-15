use super::super::*;

// フリーリスト先頭（オブジェクト番号 0 相当）の代表値を構築し、
// match で取り出したフィールドが構築時の値と一致することを確認する。
#[test]
fn free_entry_roundtrips_next_free_object_and_generation() {
    let entry = XRefEntry::Free {
        next_free_object: ObjectNumber::new(0),
        generation: GenerationNumber::new(65535),
    };

    let XRefEntry::Free {
        next_free_object,
        generation,
    } = entry
    else {
        panic!("Free バリアントであるべき");
    };

    assert_eq!(next_free_object, ObjectNumber::new(0));
    assert_eq!(generation, GenerationNumber::new(65535));
}

// 代表値・境界値の組み合わせで往復することを確認する。
#[test]
fn free_entry_roundtrips_boundary_values() {
    for (next, gen) in [(0u64, 65535u16), (1, 0), (42, 1), (u64::MAX, u16::MAX)] {
        let entry = XRefEntry::Free {
            next_free_object: ObjectNumber::new(next),
            generation: GenerationNumber::new(gen),
        };

        let XRefEntry::Free {
            next_free_object,
            generation,
        } = entry
        else {
            panic!("Free バリアントであるべき");
        };

        assert_eq!(next_free_object.value(), next);
        assert_eq!(generation.value(), gen);
    }
}
