use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::super::error::ParseErrorKind;
use super::parser;
use crate::lexer::token_kind::TokenKind;

#[test]
fn parse_object_falls_back_to_two_integers_for_one_zero_at_eof() {
    // R 不在: b"1 0" は Integer(1) → Integer(0) → UnexpectedEof の順に流れることを確認する
    let mut p = parser(b"1 0");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(0)));
    let err = p.parse_object().expect_err("third call must EOF");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_falls_back_to_three_integers_for_one_zero_two() {
    // R 不在: b"1 0 2" は Integer / Integer / Integer の順に流れることを確認する
    let mut p = parser(b"1 0 2");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(0)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(2)));
}

#[test]
fn parse_object_falls_back_to_two_integers_then_name_for_one_zero_name() {
    // R 以外のトークン: b"1 0 /Name" は Integer / Integer / Name の順に流れることを確認する
    let mut p = parser(b"1 0 /Name");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(0)));
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Name(PdfName::new(b"Name".to_vec())))
    );
}

#[test]
fn parse_object_falls_back_to_integer_then_name_for_one_name() {
    // Token2 が非 Integer: b"1 /Name" は Integer(1) → Name("Name") の順に流れることを確認する
    let mut p = parser(b"1 /Name");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Name(PdfName::new(b"Name".to_vec())))
    );
}

#[test]
fn parse_object_falls_back_to_integer_then_keyword_r_for_one_r() {
    // Token2 が単独 R: b"1 R" は Integer(1) を返した後の 2 回目で UnexpectedToken{Keyword} になることを確認する
    let mut p = parser(b"1 R");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    let err = p.parse_object().expect_err("trailing R must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual: TokenKind::Keyword
        }
    );
}
