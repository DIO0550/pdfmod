use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_empty_array_for_brackets() {
    // 入力 b"[]" で空配列 Ok(PdfObject::Array(vec![])) を返すことを確認する
    let mut p = parser(b"[]");
    assert_eq!(p.parse_object(), Ok(PdfObject::Array(Vec::new())));
}

#[test]
fn parse_object_returns_empty_array_for_brackets_with_space() {
    // 入力 b"[ ]" で SP 入り空配列が Ok(Array(vec![])) を返すことを確認する
    let mut p = parser(b"[ ]");
    assert_eq!(p.parse_object(), Ok(PdfObject::Array(Vec::new())));
}

#[test]
fn parse_object_returns_empty_array_for_brackets_with_newlines() {
    // 入力 b"[\n\n]" で改行のみで囲まれた空配列が Ok(Array(vec![])) を返すことを確認する
    let mut p = parser(b"[\n\n]");
    assert_eq!(p.parse_object(), Ok(PdfObject::Array(Vec::new())));
}
