use super::super::*;
use super::{make_ref, make_stream};

#[test]
fn from_bool_builds_boolean_variant() {
    // bool から From で変換すると Boolean バリアントになり、値が保持されることを確認する
    assert_eq!(PdfObject::from(true), PdfObject::Boolean(true));
}

#[test]
fn from_i64_builds_integer_variant() {
    // i64 から From で変換すると Integer バリアントになり、値が保持されることを確認する
    assert_eq!(PdfObject::from(42i64), PdfObject::Integer(42));
}

#[test]
fn from_f64_builds_real_variant() {
    // f64 から From で変換すると Real バリアントになり、値が保持されることを確認する
    assert_eq!(PdfObject::from(1.5f64), PdfObject::Real(1.5));
}

#[test]
fn from_vec_u8_builds_string_variant() {
    // 復号済みバイト列から From で変換すると String バリアントになることを確認する
    assert_eq!(
        PdfObject::from(b"abc".to_vec()),
        PdfObject::String(b"abc".to_vec())
    );
}

#[test]
fn from_pdf_name_builds_name_variant() {
    // PdfName から From で変換すると Name バリアントになることを確認する
    assert_eq!(
        PdfObject::from(PdfName::from("Type")),
        PdfObject::Name(PdfName::from("Type"))
    );
}

#[test]
fn from_vec_pdf_object_builds_array_variant() {
    // 要素列から From で変換すると Array バリアントになることを確認する
    assert_eq!(
        PdfObject::from(vec![PdfObject::Integer(1)]),
        PdfObject::Array(vec![PdfObject::Integer(1)])
    );
}

#[test]
fn from_dictionary_builds_dictionary_variant() {
    // PdfDictionary から From で変換すると Dictionary バリアントになることを確認する
    assert_eq!(
        PdfObject::from(PdfDictionary::new()),
        PdfObject::Dictionary(PdfDictionary::new())
    );
}

#[test]
fn from_stream_builds_stream_variant() {
    // PdfStream から From で変換すると Stream バリアントになることを確認する
    assert_eq!(
        PdfObject::from(make_stream(b"data")),
        PdfObject::Stream(make_stream(b"data"))
    );
}

#[test]
fn from_indirect_ref_builds_reference_variant() {
    // IndirectRef から From で変換すると Reference バリアントになることを確認する
    assert_eq!(
        PdfObject::from(make_ref(1, 0)),
        PdfObject::Reference(make_ref(1, 0))
    );
}

#[test]
fn integer_literal_into_resolves_to_integer_variant() {
    // 整数リテラルの .into() が From<i64> に一意解決し Integer になることを確認する
    // （追加の整数型 From を実装しない判断が守られていることの回帰ガード）
    let obj: PdfObject = 42.into();
    assert_eq!(obj, PdfObject::Integer(42));
}

#[test]
fn float_literal_into_resolves_to_real_variant() {
    // 浮動小数点リテラルの .into() が From<f64> に一意解決し Real になることを確認する
    // （追加の浮動小数点型 From を実装しない判断が守られていることの回帰ガード）
    let obj: PdfObject = 1.5.into();
    assert_eq!(obj, PdfObject::Real(1.5));
}

#[test]
fn from_f64_negative_zero_preserves_sign() {
    // -0.0 の符号ビットが落ちずに Real へ保持されることを確認する
    // （== では +0.0 と等価になってしまうため is_sign_negative() で判定する）
    let obj = PdfObject::from(-0.0);
    assert!(obj.as_real().is_some_and(f64::is_sign_negative));
}

#[test]
fn from_empty_vec_u8_builds_string_variant() {
    // 要素型を明示した空 Vec<u8> なら曖昧さなく String バリアントへ変換できることを確認する
    // （空 vec![].into() は候補 2 件で E0283 になるため、要素型明示が回避策として機能する）
    let obj: PdfObject = Vec::<u8>::new().into();
    assert_eq!(obj, PdfObject::String(Vec::new()));
}

#[test]
fn from_empty_vec_pdf_object_builds_array_variant() {
    // 要素型を明示した空 Vec<PdfObject> なら曖昧さなく Array バリアントへ変換できることを確認する
    // （同じく E0283 の回避策が機能することの固定）
    let obj: PdfObject = Vec::<PdfObject>::new().into();
    assert_eq!(obj, PdfObject::Array(Vec::new()));
}
