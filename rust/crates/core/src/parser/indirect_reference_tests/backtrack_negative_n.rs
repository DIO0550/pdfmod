use super::super::super::object::pdf_object::PdfObject;
use super::super::error::ParseErrorKind;
use super::parser;
use crate::lexer::token_kind::TokenKind;

#[test]
fn parse_object_falls_back_when_object_number_is_negative() {
    // 値域外 (N<0): b"-1 0 R" は Integer(-1) → Integer(0) → UnexpectedToken{Keyword} の順に流れることを確認する
    let mut p = parser(b"-1 0 R");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(-1)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(0)));
    let err = p.parse_object().expect_err("trailing R must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual: TokenKind::Keyword
        }
    );
}
