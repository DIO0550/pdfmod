use super::super::super::object::pdf_object::PdfObject;
use super::{parser, reference};

#[test]
fn parse_object_returns_array_with_single_reference() {
    // 配列内: b"[1 0 R]" は 1 要素 Array<[Reference(1,0)]> を返すことを確認する
    let mut p = parser(b"[1 0 R]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![reference(1, 0)]))
    );
}

#[test]
fn parse_object_returns_array_with_two_references() {
    // 配列内: b"[1 0 R 2 0 R]" は連続する Reference 2 要素を返すことを確認する
    let mut p = parser(b"[1 0 R 2 0 R]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![reference(1, 0), reference(2, 0)]))
    );
}

#[test]
fn parse_object_returns_array_mixing_reference_and_integer() {
    // 配列内: b"[1 0 R 2]" は Reference と単独 Integer の混在を保持することを確認する
    let mut p = parser(b"[1 0 R 2]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            reference(1, 0),
            PdfObject::Integer(2)
        ]))
    );
}

#[test]
fn parse_object_returns_array_of_integers_when_no_r_follows() {
    // 区別確認: b"[1 2 3]" は R 不在のため Integer 3 要素配列のままになることを確認する
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
fn parse_object_returns_nested_array_with_reference() {
    // ネスト: b"[[1 0 R]]" は外側配列の唯一要素として内側 Array<[Reference(1,0)]> を保持することを確認する
    let mut p = parser(b"[[1 0 R]]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Array(vec![reference(
            1, 0
        )])]))
    );
}
