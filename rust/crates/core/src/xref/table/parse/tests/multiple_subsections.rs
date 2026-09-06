use super::super::ParsedXRefTable;
use super::table;
use crate::byte_offset::ByteOffset;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;

// 仕様書 §4.1 の例（0 3 と 10 2）で非連続な番号範囲が登録され、間が未登録であることを確認する
#[test]
fn two_subsections_register_disjoint_object_numbers() {
    let input = table(
        &[
            (
                0,
                &[
                    "0000000000 65535 f",
                    "0000000009 00000 n",
                    "0000000058 00000 n",
                ],
            ),
            (10, &["0000000300 00000 n", "0000000450 00000 n"]),
        ],
        " \r\n",
        "trailer",
    );
    let parsed =
        ParsedXRefTable::parse(&input, ByteOffset::new(0)).expect("two subsections should parse");
    // 0 番は読み進めたうえで登録されない（#334）ため 5 件ではなく 4 件になる
    assert_eq!(parsed.table().len(), 4);
    assert!(
        ObjectNumber::new(0).is_none(),
        "object number 0 cannot be a table key"
    );
    for number in [1u64, 2, 10, 11] {
        assert!(
            parsed
                .table()
                .get(ObjectNumber::new(number).expect("positive object number"))
                .is_some(),
            "object {number} should be registered"
        );
    }
    for number in 3u64..=9 {
        assert!(
            parsed
                .table()
                .get(ObjectNumber::new(number).expect("positive object number"))
                .is_none(),
            "object {number} should not be registered"
        );
    }
}

// 3 つのサブセクションで非連続な番号範囲がすべて登録されることを確認する
#[test]
fn three_subsections_register_all_entries() {
    let input = table(
        &[
            (1, &["0000000000 65535 f"]),
            (4, &["0000000017 00000 n", "0000000058 00000 n"]),
            (9, &["0000000100 00000 n"]),
        ],
        " \r\n",
        "trailer",
    );
    let parsed =
        ParsedXRefTable::parse(&input, ByteOffset::new(0)).expect("three subsections should parse");
    assert_eq!(parsed.table().len(), 4);
    assert!(parsed
        .table()
        .get(ObjectNumber::new(1).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(4).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(5).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(9).expect("positive object number"))
        .is_some());
}

// 件数 0 のサブセクションがエントリを 1 件も登録せずに読み飛ばされることを確認する
#[test]
fn zero_count_subsection_registers_nothing() {
    let input = table(&[(0, &[])], "\n", "trailer");
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("zero-count subsection should parse");
    assert!(parsed.table().is_empty());
}

// 件数 0 のサブセクションが途中に挟まっても前後のサブセクションが登録されることを確認する
#[test]
fn zero_count_subsection_in_the_middle_is_tolerated() {
    let input = table(
        &[
            (1, &["0000000000 65535 f", "0000000017 00000 n"]),
            (5, &[]),
            (7, &["0000000058 00000 n"]),
        ],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("subsections with zero-count in the middle should parse");
    assert_eq!(parsed.table().len(), 3);
    assert!(parsed
        .table()
        .get(ObjectNumber::new(1).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(2).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(7).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(5).expect("positive object number"))
        .is_none());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(6).expect("positive object number"))
        .is_none());
}

// 同一番号が 2 度宣言されたとき、先に読んだエントリが残る（先勝ち）ことを確認する
#[test]
fn duplicate_object_number_keeps_first_entry() {
    let input = table(
        &[(1, &["0000000017 00000 n"]), (1, &["0000000999 00000 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("duplicate subsection should parse");
    assert_eq!(parsed.table().len(), 1);
    let entry = parsed
        .table()
        .get(ObjectNumber::new(1).expect("positive object number"))
        .expect("object 1 should be registered");
    assert!(
        matches!(entry, XRefEntry::InUse { offset, .. } if *offset == ByteOffset::new(17)),
        "the first entry should win, got {entry:?}"
    );
}

// サブセクションの範囲が重複する場合、重複番号は先勝ちで新規番号が追加されることを確認する
#[test]
fn overlapping_subsections_keep_first_entries_and_add_new_ones() {
    let input = table(
        &[
            (
                1,
                &[
                    "0000000000 65535 f",
                    "0000000017 00000 n",
                    "0000000058 00000 n",
                ],
            ),
            (2, &["0000000999 00000 n", "0000000888 00000 n"]),
        ],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("overlapping subsections should parse");
    assert_eq!(parsed.table().len(), 3);
    let entry_2 = parsed
        .table()
        .get(ObjectNumber::new(2).expect("positive object number"))
        .expect("object 2 present");
    assert_eq!(
        entry_2,
        &XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: crate::object::generation_number::GenerationNumber::new(0),
        }
    );
}
