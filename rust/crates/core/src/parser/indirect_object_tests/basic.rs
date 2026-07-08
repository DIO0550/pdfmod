use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::{indirect_object, parser, reference};

#[test]
fn parse_indirect_object_returns_integer_content() {
    // 最小成立ケース: b"1 0 obj 42 endobj" が IndirectObject(id=(1,0), Integer(42)) を返す
    let mut p = parser(b"1 0 obj 42 endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(1, 0, PdfObject::Integer(42)))
    );
}

#[test]
fn parse_indirect_object_returns_boolean_content() {
    // Boolean content: b"3 0 obj true endobj" が Boolean(true) を content に持つ
    let mut p = parser(b"3 0 obj true endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(3, 0, PdfObject::Boolean(true)))
    );
}

#[test]
fn parse_indirect_object_returns_null_content() {
    // Null content: b"3 0 obj null endobj" が Null を content に持つ
    let mut p = parser(b"3 0 obj null endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(3, 0, PdfObject::Null))
    );
}

#[test]
fn parse_indirect_object_returns_real_content() {
    // Real content: b"9 0 obj 2.5 endobj" が Real(2.5) を content に持つ（scalar 7 種のうち Real）
    let mut p = parser(b"9 0 obj 2.5 endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(9, 0, PdfObject::Real(2.5)))
    );
}

#[test]
fn parse_indirect_object_returns_string_content() {
    // String content: b"10 0 obj (abc) endobj" がリテラル文字列 String(b"abc") を content に持つ
    let mut p = parser(b"10 0 obj (abc) endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(10, 0, PdfObject::String(b"abc".to_vec())))
    );
}

#[test]
fn parse_indirect_object_returns_name_content() {
    // Name content: b"4 0 obj /Page endobj" が Name("Page") を content に持つ
    let mut p = parser(b"4 0 obj /Page endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(
            4,
            0,
            PdfObject::Name(PdfName::from("Page"))
        ))
    );
}

#[test]
fn parse_indirect_object_returns_array_content() {
    // 配列 content: b"5 0 obj [1 2 3] endobj" が Array[Integer(1),Integer(2),Integer(3)] を content に持つ
    let mut p = parser(b"5 0 obj [1 2 3] endobj");
    let expected = PdfObject::Array(vec![
        PdfObject::Integer(1),
        PdfObject::Integer(2),
        PdfObject::Integer(3),
    ]);
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(5, 0, expected))
    );
}

#[test]
fn parse_indirect_object_returns_dictionary_content() {
    // 辞書 content: b"12 0 obj << /Type /Page >> endobj" が Dictionary を content に持ち id==(12,0)
    let mut p = parser(b"12 0 obj << /Type /Page >> endobj");
    let mut dict = PdfDictionary::new();
    dict.insert(
        PdfName::from("Type"),
        PdfObject::Name(PdfName::from("Page")),
    );
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(12, 0, PdfObject::Dictionary(dict)))
    );
}

#[test]
fn parse_indirect_object_returns_reference_content() {
    // 参照 content: b"6 0 obj 15 0 R endobj" が content として間接参照 Reference(15,0) を持つ
    let mut p = parser(b"6 0 obj 15 0 R endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(6, 0, reference(15, 0)))
    );
}

#[test]
fn parse_indirect_object_returns_nested_dictionary_content() {
    // ネスト content: b"7 0 obj << /Kids [ << /X 1 >> ] >> endobj" がネスト構造（辞書内配列内辞書）を保持する
    let mut p = parser(b"7 0 obj << /Kids [ << /X 1 >> ] >> endobj");
    let mut inner = PdfDictionary::new();
    inner.insert(PdfName::from("X"), PdfObject::Integer(1));
    let mut outer = PdfDictionary::new();
    outer.insert(
        PdfName::from("Kids"),
        PdfObject::Array(vec![PdfObject::Dictionary(inner)]),
    );
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(7, 0, PdfObject::Dictionary(outer)))
    );
}

#[test]
fn parse_indirect_object_twice_does_not_overconsume() {
    // 連続 2 定義: 同一 Parser で 2 回呼び、1 定義ずつ読んで後続を過剰消費しないことを確認する
    let mut p = parser(b"1 0 obj 42 endobj 2 0 obj true endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(1, 0, PdfObject::Integer(42)))
    );
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(2, 0, PdfObject::Boolean(true)))
    );
}
