use super::super::super::object::pdf_object::PdfObject;
use super::super::error::ParseErrorKind;
use super::{parser, reference};

#[test]
fn parse_object_returns_two_references_in_sequence() {
    // 連続: b"1 0 R 2 0 R" は 1 回目に Reference(1,0)、2 回目に Reference(2,0)、3 回目に UnexpectedEof を返すことを確認する
    let mut p = parser(b"1 0 R 2 0 R");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
    assert_eq!(p.parse_object(), Ok(reference(2, 0)));
    let err = p.parse_object().expect_err("third call must EOF");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_returns_reference_then_trailing_integer() {
    // 連続: b"1 0 R 2" は 1 回目に Reference(1,0)、2 回目に Integer(2) を返すことを確認する
    let mut p = parser(b"1 0 R 2");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(2)));
    let err = p.parse_object().expect_err("third call must EOF");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}
