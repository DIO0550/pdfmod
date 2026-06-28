use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_array_skipping_inline_comment() {
    // 入力 b"[1 % comment\n 2]" で要素間の % コメントが透過スキップされ AST に現れないことを確認する
    let mut p = parser(b"[1 % comment\n 2]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
        ]))
    );
}

#[test]
fn parse_object_returns_array_skipping_leading_comments() {
    // 入力 b"[%a\n%b\n 1]" で配列先頭の連続コメントが透過スキップされ単一要素を返すことを確認する
    let mut p = parser(b"[%a\n%b\n 1]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Integer(1)]))
    );
}

#[test]
fn parse_object_returns_array_skipping_trailing_comment() {
    // 入力 b"[1 2 %tail\n]" で末尾コメントが透過スキップされ ArrayEnd まで進むことを確認する
    let mut p = parser(b"[1 2 %tail\n]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
        ]))
    );
}
