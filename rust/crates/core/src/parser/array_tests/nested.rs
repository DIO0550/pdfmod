use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_array_for_two_sub_arrays() {
    // 入力 b"[[1 2] [3 4]]" で 2 つのサブ配列を持つネスト Array を返すことを確認する
    let mut p = parser(b"[[1 2] [3 4]]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Array(vec![PdfObject::Integer(1), PdfObject::Integer(2)]),
            PdfObject::Array(vec![PdfObject::Integer(3), PdfObject::Integer(4)]),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_single_empty_nested() {
    // 入力 b"[[]]" で空ネストの Array(Array(vec![])) を返すことを確認する
    let mut p = parser(b"[[]]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Array(Vec::new())]))
    );
}

#[test]
fn parse_object_returns_array_for_scalar_sub_array_scalar() {
    // 入力 b"[1 [2] 3]" でスカラ+サブ配列+スカラの順序保存ネスト 1 段を返すことを確認する
    let mut p = parser(b"[1 [2] 3]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Array(vec![PdfObject::Integer(2)]),
            PdfObject::Integer(3),
        ]))
    );
}
