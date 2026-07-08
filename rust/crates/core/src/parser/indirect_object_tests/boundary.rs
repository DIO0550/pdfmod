use super::super::super::object::pdf_object::PdfObject;
use super::{indirect_object, parser};

#[test]
fn parse_indirect_object_accepts_object_number_zero() {
    // 境界: N=0（最小オブジェクト番号）を寛容方針で受理し、object_number が 0 になる
    let mut p = parser(b"0 0 obj true endobj");
    let result = p
        .parse_indirect_object()
        .expect("object number 0 should be accepted");
    assert_eq!(result.id().object_number().value(), 0);
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
