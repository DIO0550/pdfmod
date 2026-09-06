use super::super::super::object::pdf_object::PdfObject;
use super::{indirect_object, parser};
use crate::parser::error::ParseErrorKind;

#[test]
fn parse_indirect_object_rejects_object_number_zero() {
    // 境界: N=0 は ISO 32000-1 §7.3.10 の正整数ではないため拒否される（#334）
    let mut p = parser(b"0 0 obj true endobj");
    let error = p
        .parse_indirect_object()
        .expect_err("object number 0 should be rejected");
    assert!(matches!(error.kind, ParseErrorKind::UnexpectedToken { .. }));
}

#[test]
fn parse_indirect_object_accepts_object_number_one() {
    // 境界: N=1（最小の有効なオブジェクト番号）を受理し、object_number が 1 になる
    let mut p = parser(b"1 0 obj true endobj");
    let result = p
        .parse_indirect_object()
        .expect("object number 1 should be accepted");
    assert_eq!(result.id().object_number().value(), 1);
}

#[test]
fn parse_indirect_object_accepts_generation_zero() {
    // 境界: G=0（最小世代）を寛容方針で受理し、generation_number が 0 になる
    let mut p = parser(b"7 0 obj true endobj");
    let result = p
        .parse_indirect_object()
        .expect("generation 0 should be accepted");
    assert_eq!(result.id().generation_number().value(), 0);
}

#[test]
fn parse_indirect_object_accepts_generation_u16_max() {
    // 境界: G=u16::MAX(65535) を受理境界として受理する
    let mut p = parser(b"5 65535 obj true endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(5, 65535, PdfObject::Boolean(true)))
    );
}
