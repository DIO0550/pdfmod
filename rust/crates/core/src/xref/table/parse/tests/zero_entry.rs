use super::super::ParsedXRefTable;
use super::table;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;
use crate::xref::error::XRefErrorKind;

// オブジェクト番号 0 のエントリは読み進めたうえで表に登録されないことを確認する（#334）
#[test]
fn test_zero_entry_is_read_but_not_inserted() {
    let input = table(
        &[(
            0,
            &[
                "0000000000 65535 f",
                "0000000017 00000 n",
                "0000000081 00000 n",
            ],
        )],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("table with 0 entry should parse");

    assert_eq!(parsed.table().len(), 2, "0 番は表に登録されない");
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(1).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(2).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(81),
            generation: GenerationNumber::new(0),
        })
    );
    assert_eq!(
        parsed.end(),
        ByteOffset::new(input.len() as u64 - "trailer".len() as u64),
        "0 番を読み飛ばしても読み終わり位置は変わらない"
    );
}

// 0 番エントリでもフラグ文字は検証され、不正なら従来どおりエラーになることを確認する
#[test]
fn test_zero_entry_with_invalid_flag_is_rejected() {
    let input = table(&[(0, &["0000000000 65535 x"])], " \r\n", "trailer");
    let error = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect_err("invalid flag should be rejected even for object number 0");

    assert!(matches!(error.kind, XRefErrorKind::InvalidEntryFlag { .. }));
}

// 0 番エントリでも世代番号の範囲は検証されることを確認する
#[test]
fn test_zero_entry_with_out_of_range_generation_is_rejected() {
    let input = table(&[(0, &["0000000000 99999 f"])], " \r\n", "trailer");
    let error = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect_err("out of range generation should be rejected even for object number 0");

    assert!(matches!(
        error.kind,
        XRefErrorKind::GenerationOutOfRange { .. }
    ));
}

// 0 番だけのサブセクションでも trailer まで到達し、表が空になることを確認する
#[test]
fn test_subsection_with_only_zero_entry_yields_empty_table() {
    let input = table(&[(0, &["0000000000 65535 f"])], " \r\n", "trailer");
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("subsection with only object number 0 should parse");

    assert!(parsed.table().is_empty(), "0 番だけなら表は空になる");
}

// 複数の 0 N サブセクションでも各 0 番だけがスキップされ、正番号が落ちないことを確認する
#[test]
fn test_zero_entry_skipped_per_subsection_keeps_positive_numbers() {
    let input = table(
        &[
            (0, &["0000000000 65535 f", "0000000017 00000 n"]),
            (0, &["0000000000 65535 f", "0000000099 00000 n"]),
        ],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("multiple subsections starting at 0 should parse");

    assert_eq!(parsed.table().len(), 1);
    // 先勝ちのため、最初のサブセクションの 1 番が残る
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(1).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
}

// 0 番が慣例に反して in-use（n）で宣言されていてもエラーにならず、
// フラグに関わらずスキップされて後続エントリが登録されることを確認する
#[test]
fn test_zero_entry_declared_in_use_is_skipped_without_error() {
    let input = table(
        &[(0, &["0000000000 00000 n", "0000000017 00000 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("object number 0 declared as in-use should not be an error");

    assert_eq!(parsed.table().len(), 1);
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(1).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
}
