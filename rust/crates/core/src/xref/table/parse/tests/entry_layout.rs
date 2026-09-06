use super::super::ParsedXRefTable;
use super::table;
use crate::byte_offset::ByteOffset;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;

// 行末が異なる（20 バイト / 19 バイト / CRLF / CR 単独）4 通りで同一のエントリが得られることを確認する
#[test]
fn entries_parse_identically_across_eol_variants() {
    let cases: [(&str, &str); 4] = [
        (" \r\n", "20 byte (SP CR LF)"),
        ("\n", "19 byte (LF)"),
        ("\r\n", "CR LF"),
        ("\r", "CR only"),
    ];
    let expected = ParsedXRefTable::parse(
        &table(&[(1, &["0000000017 00000 n"])], " \r\n", "trailer"),
        ByteOffset::new(0),
    )
    .expect("baseline entry should parse")
    .into_table();

    for (eol, name) in cases {
        let input = table(&[(1, &["0000000017 00000 n"])], eol, "trailer");
        let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
            .unwrap_or_else(|error| panic!("{name} should parse: {error:?}"));
        assert_eq!(parsed.into_table(), expected, "{name}");
    }
}

// 1 つのサブセクション内で行末の種類が混在しても正しく解析されることを確認する
#[test]
fn mixed_eol_variants_in_single_subsection_are_supported() {
    let input =
        b"xref\n1 3\n0000000000 65535 f\n0000000017 00000 n \r\n0000000058 00000 n\rtrailer";
    let parsed = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect("mixed EOL in single subsection should parse");
    assert_eq!(parsed.table().len(), 3);
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(1).expect("positive object number")),
        Some(&XRefEntry::Free {
            next_free_object: FreeObjectNumber::new(0),
            generation: GenerationNumber::new(65535),
        })
    );
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(2).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(3).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(58),
            generation: GenerationNumber::new(0),
        })
    );
}

// フィールド間の空白が複数あっても解析できることを確認する
#[test]
fn extra_whitespace_between_fields_is_tolerated() {
    let input = table(&[(1, &["0000000017   00000    n"])], "\n", "trailer");
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("loosely formatted entry should parse");
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

// ゼロ埋めなしのエントリ（17 0 n）でも解析できることを確認する
#[test]
fn missing_zero_padding_is_tolerated() {
    let input = table(&[(1, &["17 0 n"])], "\n", "trailer");
    let parsed =
        ParsedXRefTable::parse(&input, ByteOffset::new(0)).expect("unpadded entry should parse");
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

// 桁数が仕様超過（11 桁 / 6 桁）でも桁数を検証せず解析できることを確認する
#[test]
fn digits_exceeding_standard_width_are_tolerated() {
    let input = table(&[(1, &["00000000017 000000 n"])], "\n", "trailer");
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("entry with extra digit width should parse");
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

// エントリ行の間にコメント行が挟まっても読み飛ばされることを確認する
#[test]
fn comment_between_entries_is_skipped() {
    let input = b"xref\n1 2\n0000000017 00000 n \n%comment\n0000000058 00000 n \ntrailer";
    let parsed = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect("comment between entries should be skipped");
    assert_eq!(parsed.table().len(), 2);
}
