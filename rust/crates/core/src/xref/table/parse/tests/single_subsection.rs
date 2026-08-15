use super::super::parse_classic_xref_table;
use super::table;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;

// free エントリ 1 件の最小テーブルが解析できることを確認する
#[test]
fn minimal_table_with_single_free_entry_parses() {
    let input = table(&[(0, &["0000000000 65535 f"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("minimal free entry should parse");
    assert_eq!(parsed.table().len(), 1);
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::Free {
            next_free_object: ObjectNumber::new(0),
            generation: GenerationNumber::new(65535),
        })
    );
}

// free エントリの第1フィールドが offset ではなく next_free_object に入ることを確認する
#[test]
fn free_entry_maps_first_field_to_next_free_object() {
    let input = table(&[(0, &["0000000003 00007 f"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("single free entry should parse");
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::Free {
            next_free_object: ObjectNumber::new(3),
            generation: GenerationNumber::new(7),
        })
    );
}

// in-use エントリの第1フィールドが offset に入ることを確認する
#[test]
fn in_use_entry_maps_first_field_to_offset() {
    let input = table(&[(0, &["0000000017 00000 n"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("single in-use entry should parse");
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
}

// free と in-use が混在する単一サブセクションで全件が正しく登録されることを確認する
#[test]
fn mixed_free_and_in_use_entries_are_registered() {
    let input = table(
        &[(
            0,
            &[
                "0000000000 65535 f",
                "0000000009 00000 n",
                "0000000058 00000 n",
            ],
        )],
        " \r\n",
        "trailer",
    );
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("mixed subsection should parse");
    assert_eq!(parsed.table().len(), 3);
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::Free {
            next_free_object: ObjectNumber::new(0),
            generation: GenerationNumber::new(65535),
        })
    );
    assert_eq!(
        parsed.table().get(ObjectNumber::new(1)),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(9),
            generation: GenerationNumber::new(0),
        })
    );
    assert_eq!(
        parsed.table().get(ObjectNumber::new(2)),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(58),
            generation: GenerationNumber::new(0),
        })
    );
}

// サブセクションヘッダの先頭番号を起点に採番され、その手前の番号は未登録であることを確認する
#[test]
fn object_numbers_start_from_subsection_first_number() {
    let input = table(
        &[(5, &["0000000017 00000 n", "0000000058 00000 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("subsection starting at 5 should parse");
    assert!(parsed.table().get(ObjectNumber::new(4)).is_none());
    assert!(parsed.table().get(ObjectNumber::new(5)).is_some());
    assert!(parsed.table().get(ObjectNumber::new(6)).is_some());
    assert_eq!(parsed.table().len(), 2);
}

// 先頭番号が u64 上限近くでも採番の加算が溢れず panic しないことを確認する
#[test]
fn large_first_object_number_does_not_overflow() {
    let input = table(
        &[(
            18446744073709551610,
            &["0000000017 00000 n", "0000000058 00000 n"],
        )],
        " \r\n",
        "trailer",
    );
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("subsection with large object numbers should parse");
    assert_eq!(parsed.table().len(), 2);
    assert!(parsed
        .table()
        .get(ObjectNumber::new(18446744073709551610))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(18446744073709551611))
        .is_some());
}

// 番号 u64::MAX ちょうど 1 件を宣言するヘッダが、表現可能なので受理されることを確認する
#[test]
fn subsection_ending_exactly_at_u64_max_is_accepted() {
    let input = table(&[(u64::MAX, &["0000000017 00000 n"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("subsection covering only object u64::MAX should parse");
    assert_eq!(parsed.table().len(), 1);
    assert_eq!(
        parsed.table().get(ObjectNumber::new(u64::MAX)),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
}
