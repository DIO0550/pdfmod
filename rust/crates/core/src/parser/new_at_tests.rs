use super::Parser;
use crate::byte_offset::ByteOffset;
use crate::object::pdf_object::PdfObject;

// 指定位置から読み始め、その位置のオブジェクトが返ることを確認する
#[test]
fn new_at_starts_reading_from_given_position() {
    let input = b"999 (skipped) 42";
    let mut parser = Parser::new_at(input, b"999 (skipped) ".len());
    assert_eq!(parser.parse_object(), Ok(PdfObject::Integer(42)));
}

// 消費後の position が入力先頭起点の絶対オフセットであることを確認する
#[test]
fn position_stays_absolute_after_new_at() {
    let input = b"999 42";
    let mut parser = Parser::new_at(input, b"999 ".len());
    let _ = parser.parse_object().expect("integer should parse");
    assert_eq!(parser.position(), ByteOffset::new(input.len() as u64));
}

// エラー位置が入力先頭起点の絶対オフセットで返ることを確認する
#[test]
fn error_position_stays_absolute_after_new_at() {
    let input = b"0 0 endobj";
    let mut parser = Parser::new_at(input, b"0 0 ".len());
    let error = parser
        .parse_object()
        .expect_err("endobj should be rejected");
    assert_eq!(error.position, ByteOffset::new(b"0 0 ".len() as u64));
}

// pos == input.len() なら即 EOF として扱われることを確認する
#[test]
fn new_at_input_end_is_eof() {
    let input = b"42";
    let mut parser = Parser::new_at(input, input.len());
    assert!(parser.parse_object().is_err());
}

// pos が入力長を超えても panic せず EOF 扱いになることを確認する
#[test]
fn new_at_beyond_input_end_is_clamped() {
    let input = b"42";
    let mut parser = Parser::new_at(input, input.len() + 100);
    assert!(parser.parse_object().is_err());
}

// new(input) と new_at(input, 0) が同じ結果になることを確認する
#[test]
fn new_at_zero_matches_new() {
    let input = b"42";
    let mut from_new = Parser::new(input);
    let mut from_new_at = Parser::new_at(input, 0);
    assert_eq!(from_new.parse_object(), from_new_at.parse_object());
}
