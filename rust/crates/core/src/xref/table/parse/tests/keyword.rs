use super::super::ParsedXRefTable;
use crate::byte_offset::ByteOffset;
use crate::xref::error::XRefErrorKind;

// start が xref を直接指す標準的なテーブルが解析できることを確認する
#[test]
fn start_points_directly_at_xref_keyword() {
    let input = b"xref\n1 1\n0000000000 65535 f \ntrailer";
    let parsed = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect("standard xref table should parse");
    assert_eq!(parsed.table().len(), 1);
}

// start が指す位置に前置きの空白があっても、飛ばして xref を検出することを確認する
#[test]
fn whitespace_before_xref_keyword_is_skipped() {
    let input = b"  \r\nxref\n1 1\n0000000000 65535 f \ntrailer";
    let parsed = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect("leading whitespace before xref keyword should be skipped");
    assert_eq!(parsed.table().len(), 1);
}

// xref キーワードの前にコメントがあっても飛ばして検出することを確認する
#[test]
fn comment_before_xref_keyword_is_skipped() {
    let input = b"%comment\nxref\n1 1\n0000000000 65535 f \ntrailer";
    let parsed = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect("comment before xref keyword should be skipped");
    assert_eq!(parsed.table().len(), 1);
}

// ファイル途中の start オフセットから解析したとき、end がファイル絶対位置で返ることを確認する
#[test]
fn xref_at_arbitrary_start_offset_returns_absolute_positions() {
    let prefix = b"0123456789";
    let mut input = Vec::from(&prefix[..]);
    let table_bytes = b"xref\n1 1\n0000000017 00000 n \ntrailer";
    input.extend_from_slice(table_bytes);
    let start = ByteOffset::new(10);
    let parsed = ParsedXRefTable::parse(&input, start).expect("xref at offset 10 should parse");
    assert_eq!(parsed.table().len(), 1);
    let trailer_rel = table_bytes
        .windows(b"trailer".len())
        .position(|w| w == b"trailer")
        .expect("table_bytes has trailer");
    assert_eq!(parsed.end(), ByteOffset::new(10 + trailer_rel as u64));
}

// 指定位置に xref キーワードが無い場合に MissingXRefKeyword で拒否されることを確認する
#[test]
fn missing_xref_keyword_is_rejected() {
    let input = b"trailer\n<< >>";
    let error = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect_err("input without xref keyword should be rejected");
    assert_eq!(error.kind, XRefErrorKind::MissingXRefKeyword);
    assert_eq!(error.position, ByteOffset::new(0));
}

// キーワード直後がトークン境界でない `xrefs` を拒否することを確認する
#[test]
fn keyword_prefix_without_token_boundary_is_rejected() {
    let input = b"xrefs\n0 1\n0000000000 65535 f \n";
    let error = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect_err("`xrefs` should not be accepted as the xref keyword");
    assert_eq!(error.kind, XRefErrorKind::MissingXRefKeyword);
    assert_eq!(error.position, ByteOffset::new(0));
}

// start が入力長と等しい場合、MissingXRefKeyword で拒否されることを確認する
#[test]
fn start_offset_at_input_end_is_rejected() {
    let input: &[u8] = b"";
    let error = ParsedXRefTable::parse(input, ByteOffset::new(0))
        .expect_err("empty input should be rejected");
    assert_eq!(error.kind, XRefErrorKind::MissingXRefKeyword);
    assert_eq!(error.position, ByteOffset::new(0));
}

// start が入力長を超える場合、クランプせずに start をそのまま position として拒否することを確認する
#[test]
fn start_offset_beyond_input_is_rejected_with_original_position() {
    let input = b"xref\n0 0\ntrailer";
    let start = ByteOffset::new(u64::MAX);
    let error = ParsedXRefTable::parse(input, start)
        .expect_err("start offset beyond the input should be rejected");
    assert_eq!(error.kind, XRefErrorKind::MissingXRefKeyword);
    assert_eq!(error.position, start);
}
