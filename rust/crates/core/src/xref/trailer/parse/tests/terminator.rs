use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;
use crate::xref::table::parse::ParsedXRefTable;

// end() が辞書の閉じ >> の直後を指していることを確認する
#[test]
fn end_points_after_closing_dictionary() {
    let input = b"trailer\n<< /Size 1 /Root 1 0 R >>\nstartxref\n123\n%%EOF";
    let parsed = ParsedTrailer::parse(input, ByteOffset::new(0)).expect("trailer should parse");
    let expected_end = b"trailer\n<< /Size 1 /Root 1 0 R >>".len() as u64;
    assert_eq!(parsed.end(), ByteOffset::new(expected_end));
}

// start が非ゼロの場合に end() が入力先頭起点の絶対オフセットで返ることを確認する
#[test]
fn end_is_absolute_when_start_is_nonzero() {
    let prefix = b"%PDF-1.7\n";
    let body = simple_trailer("/Size 1 /Root 1 0 R");
    let mut input = prefix.to_vec();
    input.extend_from_slice(&body);

    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(prefix.len() as u64))
        .expect("trailer with non-zero start should parse");
    assert_eq!(parsed.end(), ByteOffset::new(input.len() as u64));
}

// 入力が辞書の閉じ >> でちょうど終わる場合に end() が入力長と一致することを確認する
#[test]
fn end_equals_input_length_when_dictionary_ends_input() {
    let input = simple_trailer("/Size 1 /Root 1 0 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("trailer ending at input end should parse");
    assert_eq!(parsed.end(), ByteOffset::new(input.len() as u64));
}

// ParsedXRefTable::end() が返す位置をそのまま ParsedTrailer::parse に渡して両方が解析できることを確認する
#[test]
fn xref_table_end_feeds_trailer_parse() {
    let input = b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 /Root 1 0 R >>";
    let parsed_table =
        ParsedXRefTable::parse(input, ByteOffset::new(0)).expect("xref table should parse");
    let parsed_trailer = ParsedTrailer::parse(input, parsed_table.end())
        .expect("trailer should parse from xref table end");
    assert_eq!(parsed_trailer.trailer().size(), 1);
    assert_eq!(parsed_trailer.end(), ByteOffset::new(input.len() as u64));
}
