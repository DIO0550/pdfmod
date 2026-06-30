use super::super::super::object::pdf_object::PdfObject;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_falls_back_when_generation_exceeds_u16_max() {
    // 値域外 (G > u16::MAX): b"1 65536 R" は Integer(1) → Integer(65536) → UnexpectedToken{Keyword} の順に流れることを確認する
    let mut p = parser(b"1 65536 R");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(65536)));
    let err = p.parse_object().expect_err("trailing R must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "Keyword"
        }
    );
}

#[test]
fn parse_object_falls_back_when_generation_is_negative() {
    // 値域外 (G < 0): b"1 -1 R" は Integer(1) → Integer(-1) → UnexpectedToken{Keyword} の順に流れることを確認する
    let mut p = parser(b"1 -1 R");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(-1)));
    let err = p.parse_object().expect_err("trailing R must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "Keyword"
        }
    );
}
