use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_array_for_three_integers() {
    // 入力 b"[1 2 3]" で整数 3 要素の Array を返すことを確認する
    let mut p = parser(b"[1 2 3]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(3),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_boolean_and_null_mix() {
    // 入力 b"[true false null]" で Boolean / Null 混在の Array を返すことを確認する
    let mut p = parser(b"[true false null]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Boolean(true),
            PdfObject::Boolean(false),
            PdfObject::Null,
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_two_names() {
    // 入力 b"[/A /B]" で Name 2 要素の Array を返すことを確認する
    let mut p = parser(b"[/A /B]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Name(PdfName::new(b"A".to_vec())),
            PdfObject::Name(PdfName::new(b"B".to_vec())),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_two_literal_strings() {
    // 入力 b"[(s1) (s2)]" で LiteralString 2 要素の Array を返すことを確認する
    let mut p = parser(b"[(s1) (s2)]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::String(b"s1".to_vec()),
            PdfObject::String(b"s2".to_vec()),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_two_hex_strings() {
    // 入力 b"[<41> <42>]" で HexString 2 要素 (A / B) の Array を返すことを確認する
    let mut p = parser(b"[<41> <42>]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::String(b"A".to_vec()),
            PdfObject::String(b"B".to_vec()),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_single_integer() {
    // 境界値: 入力 b"[1]" で単一要素の Array を返すことを確認する
    let mut p = parser(b"[1]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Integer(1)]))
    );
}
