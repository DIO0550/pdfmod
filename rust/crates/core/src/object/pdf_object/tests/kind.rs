use super::super::*;
use super::{make_ref, make_stream};
use crate::object::object_kind::ObjectKind;

#[test]
fn kind_returns_matching_object_kind_for_every_variant() {
    // 全 10 バリアントの kind() が対応する ObjectKind を返すことを確認する。
    // 中身が空の String / Array / Dictionary を混ぜ、種別判定が中身に依存しないことも押さえる。
    let cases: [(PdfObject, ObjectKind); 10] = [
        (PdfObject::Null, ObjectKind::Null),
        (PdfObject::Boolean(true), ObjectKind::Boolean),
        (PdfObject::Integer(0), ObjectKind::Integer),
        (PdfObject::Real(0.0), ObjectKind::Real),
        (PdfObject::String(Vec::new()), ObjectKind::String),
        (PdfObject::Name(PdfName::from("Type")), ObjectKind::Name),
        (PdfObject::Array(Vec::new()), ObjectKind::Array),
        (
            PdfObject::Dictionary(PdfDictionary::new()),
            ObjectKind::Dictionary,
        ),
        (PdfObject::Stream(make_stream(b"")), ObjectKind::Stream),
        (PdfObject::Reference(make_ref(1, 0)), ObjectKind::Reference),
    ];

    for (object, expected) in cases {
        assert_eq!(object.kind(), expected, "object: {object:?}");
    }
}
