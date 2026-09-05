use super::super::*;
use super::{make_ref, make_stream};

#[test]
fn reference_constructs_and_matches_reference_arm() {
    // Reference(IndirectRef) を構築し matches! で Reference 腕に入ることを確認する
    let obj = PdfObject::Reference(make_ref(1, 0));
    assert!(matches!(obj, PdfObject::Reference(_)));
}

#[test]
fn as_reference_returns_some_for_reference() {
    // Reference(ir) に as_reference() を呼ぶと Some(ir) を返す（Copy 値返し）ことを代表値・境界値で確認する
    let ir = make_ref(5, 0);
    assert_eq!(PdfObject::Reference(ir).as_reference(), Some(ir));
    let boundary = make_ref(u64::MAX, u16::MAX);
    assert_eq!(
        PdfObject::Reference(boundary).as_reference(),
        Some(boundary)
    );
}

#[test]
fn as_reference_returns_none_for_non_reference_variants() {
    // Reference 以外（Null/Boolean/Integer/Real/String/Name/Array/Dictionary/Stream）では as_reference() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::Array(vec![PdfObject::Integer(1)]),
        PdfObject::Dictionary(PdfDictionary::new()),
        PdfObject::Stream(make_stream(b"data")),
    ];
    for obj in &variants {
        assert_eq!(obj.as_reference(), None);
    }
}

#[test]
fn same_inner_references_are_equal() {
    // 同一 IndirectRef を内包する Reference 同士は == で等価になることを確認する
    assert_eq!(
        PdfObject::Reference(make_ref(7, 3)),
        PdfObject::Reference(make_ref(7, 3))
    );
}

#[test]
fn different_inner_references_are_not_equal() {
    // 内包 IndirectRef が異なる Reference 同士は != で非等価になることを確認する
    // generation 差異・object_number 差異の両軸で非等価になることを確認する（片フィールド依存でないことを保証）
    assert_ne!(
        PdfObject::Reference(make_ref(7, 3)),
        PdfObject::Reference(make_ref(7, 4))
    );
    assert_ne!(
        PdfObject::Reference(make_ref(7, 3)),
        PdfObject::Reference(make_ref(8, 3))
    );
}

#[test]
fn debug_format_contains_reference_variant_name() {
    // Debug 出力が Reference のバリアント名を含むことを確認する
    assert!(format!("{:?}", PdfObject::Reference(make_ref(1, 0))).contains("Reference"));
}
