use super::super::super::object::pdf_object::PdfObject;
use super::{parser, reference};

#[test]
fn parse_object_returns_reference_for_one_zero_r() {
    // 最小成立ケース: 入力 b"1 0 R" で Reference(1, 0) を返すことを確認する
    let mut p = parser(b"1 0 R");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}

#[test]
fn parse_object_returns_reference_for_two_three_r() {
    // 任意の (N, G) ペア: 入力 b"2 3 R" で Reference(2, 3) を返すことを確認する
    let mut p = parser(b"2 3 R");
    assert_eq!(p.parse_object(), Ok(reference(2, 3)));
}

#[test]
fn parse_object_returned_reference_carries_object_id() {
    // Reference が内包する ObjectId(N, G) を取り出して個別の値を確認する
    let mut p = parser(b"7 4 R");
    let object = p.parse_object().expect("indirect reference should parse");
    let reference = match object {
        PdfObject::Reference(r) => r,
        other => panic!("expected Reference, got {:?}", other),
    };
    assert_eq!(reference.target().object_number().value(), 7);
    assert_eq!(reference.target().generation_number().value(), 4);
}
