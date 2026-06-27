use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_array_for_three_level_nest() {
    // 入力 b"[[[1]]]" で 3 段ネストの Array が再帰的に構築されることを確認する
    let mut p = parser(b"[[[1]]]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Array(vec![
            PdfObject::Array(vec![PdfObject::Integer(1)])
        ])]))
    );
}

#[test]
fn parse_object_returns_array_for_four_level_nest() {
    // 境界値: 入力 b"[[[[1]]]]" で 4 段ネストの Array が再帰的に構築されることを確認する
    let mut p = parser(b"[[[[1]]]]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Array(vec![
            PdfObject::Array(vec![PdfObject::Array(vec![PdfObject::Integer(1)])])
        ])]))
    );
}
