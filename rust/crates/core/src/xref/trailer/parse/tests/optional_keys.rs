use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;
use crate::xref::trailer::error::TrailerErrorKind;
use crate::xref::trailer::key::TrailerKey;

// /Prev が ByteOffset として正しく取り出せることを確認する
#[test]
fn prev_is_extracted_as_byte_offset() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Prev 408");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("/Prev should parse");
    assert_eq!(parsed.trailer().prev(), Some(ByteOffset::new(408)));
}

// /XRefStm が ByteOffset として正しく取り出せることを確認する
#[test]
fn xref_stm_is_extracted_as_byte_offset() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /XRefStm 1234");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("/XRefStm should parse");
    assert_eq!(parsed.trailer().xref_stm(), Some(ByteOffset::new(1234)));
}

// /Info が間接参照として正しく取り出せることを確認する
#[test]
fn info_is_extracted_as_reference() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Info 5 0 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("/Info should parse");
    assert_eq!(
        parsed.trailer().info().map(|r| r.target()),
        Some(ObjectId::new(
            ObjectNumber::new(5),
            GenerationNumber::new(0)
        ))
    );
}

// すべての任意キー（/Prev /XRefStm /Info /ID /Encrypt）が同時に存在する場合にすべて Some で取り出せることを確認する
#[test]
fn all_optional_keys_together() {
    let input = simple_trailer(
        "/Size 6 /Root 1 0 R /Prev 408 /XRefStm 1234 /Info 5 0 R /ID [<aabb> <ccdd>] /Encrypt 7 0 R",
    );
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("all optional keys should parse together");
    let trailer = parsed.trailer();

    assert_eq!(trailer.size(), 6);
    assert_eq!(trailer.prev(), Some(ByteOffset::new(408)));
    assert_eq!(trailer.xref_stm(), Some(ByteOffset::new(1234)));
    assert!(trailer.info().is_some());
    assert!(trailer.id().is_some());
    assert!(trailer.encrypt().is_some());
}

// /Prev 0 が正しく ByteOffset::new(0) として受理されることを確認する
#[test]
fn prev_zero_is_accepted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Prev 0");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("/Prev 0 should parse");
    assert_eq!(parsed.trailer().prev(), Some(ByteOffset::new(0)));
}

// /Prev が負の整数の場合に NegativeValue エラーになることを確認する
#[test]
fn negative_prev_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Prev -1");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("negative /Prev should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::NegativeValue {
            key: TrailerKey::Prev,
        }
    );
}

// /XRefStm が負の整数の場合に NegativeValue エラーになることを確認する
#[test]
fn negative_xref_stm_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /XRefStm -5");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("negative /XRefStm should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::NegativeValue {
            key: TrailerKey::XRefStm,
        }
    );
}

// /Prev が整数以外の型の場合に InvalidKeyType エラーになることを確認する
#[test]
fn prev_with_wrong_type_is_rejected() {
    let cases: [(&str, &'static str); 4] = [
        ("/Size 6 /Root 1 0 R /Prev 1.5", "Real"),
        ("/Size 6 /Root 1 0 R /Prev /Offset", "Name"),
        ("/Size 6 /Root 1 0 R /Prev (408)", "String"),
        ("/Size 6 /Root 1 0 R /Prev 408 0 R", "Reference"),
    ];
    for (body, expected_kind) in cases {
        let input = simple_trailer(body);
        let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
            .expect_err("non-integer /Prev should be rejected");
        assert_eq!(
            error.kind,
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Prev,
                actual_kind: expected_kind,
            },
            "body: {body}"
        );
    }
}

// /Info が間接参照以外の型の場合に InvalidKeyType エラーになることを確認する
#[test]
fn info_with_wrong_type_is_rejected() {
    let cases: [(&str, &'static str); 4] = [
        ("/Size 6 /Root 1 0 R /Info 5", "Integer"),
        ("/Size 6 /Root 1 0 R /Info /InfoDict", "Name"),
        ("/Size 6 /Root 1 0 R /Info << /Title (Doc) >>", "Dictionary"),
        ("/Size 6 /Root 1 0 R /Info [5 0 R]", "Array"),
    ];
    for (body, expected_kind) in cases {
        let input = simple_trailer(body);
        let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
            .expect_err("non-reference /Info should be rejected");
        assert_eq!(
            error.kind,
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Info,
                actual_kind: expected_kind,
            },
            "body: {body}"
        );
    }
}

// 任意キーの値が null の場合にエラーにならず None として扱われることを確認する
#[test]
fn optional_key_null_is_treated_as_absent() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Prev null /Info null");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("optional keys with null should parse as None");
    assert_eq!(parsed.trailer().prev(), None);
    assert_eq!(parsed.trailer().info(), None);
}

// /Prev から取得した ByteOffset をそのまま ParsedXRefTable::parse の start 引数に渡せることを確認する
#[test]
fn prev_byte_offset_can_feed_xref_table_parse() {
    use crate::xref::table::parse::ParsedXRefTable;

    let older_xref = b"xref\n0 1\n0000000000 65535 f \n";
    let newer_trailer = "trailer\n<< /Size 2 /Root 1 0 R /Prev 0 >>";
    let mut input = older_xref.to_vec();
    input.extend_from_slice(newer_trailer.as_bytes());

    let parsed_trailer = ParsedTrailer::parse(&input, ByteOffset::new(older_xref.len() as u64))
        .expect("newer trailer should parse");
    let prev_offset = parsed_trailer
        .trailer()
        .prev()
        .expect("/Prev should be Some");

    let parsed_older_table = ParsedXRefTable::parse(&input, prev_offset)
        .expect("older table should parse with /Prev offset");
    assert_eq!(parsed_older_table.table().len(), 1);
}
