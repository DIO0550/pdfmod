use super::super::*;
use super::{make_ref, make_stream};
use crate::object::string::StringEncoding;

#[test]
fn string_constructs_and_matches_string_arm() {
    // String(PdfString::literal(b"abc")) を構築し matches! で String 腕に入ることを確認する
    let obj = PdfObject::String(PdfString::literal(b"abc"));
    assert!(matches!(obj, PdfObject::String(_)));
}

#[test]
fn as_string_bytes_returns_some_for_string() {
    // String に as_string_bytes() を呼ぶと encoding によらず Some(b"abc") を返すことを確認する
    assert_eq!(
        PdfObject::String(PdfString::literal(b"abc")).as_string_bytes(),
        Some(b"abc".as_slice())
    );
    assert_eq!(
        PdfObject::String(PdfString::hex(b"abc")).as_string_bytes(),
        Some(b"abc".as_slice())
    );
}

#[test]
fn as_pdf_string_returns_some_with_encoding_for_string() {
    // String に as_pdf_string() を呼ぶと encoding 込みの &PdfString を返すことを確認する
    let obj = PdfObject::String(PdfString::hex(b"abc"));
    assert_eq!(
        obj.as_pdf_string().map(PdfString::encoding),
        Some(StringEncoding::Hex)
    );
}

#[test]
fn as_pdf_string_returns_none_for_non_string_variants() {
    // String 以外（Null/Boolean/Integer/Real/Name/Stream/Reference）では as_pdf_string() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for obj in &variants {
        assert_eq!(obj.as_pdf_string(), None);
    }
}

#[test]
fn string_objects_differ_when_encoding_differs() {
    // 同一バイト列でも encoding が異なる String オブジェクトは非等価になることを確認する
    assert_ne!(
        PdfObject::String(PdfString::literal(b"Hello")),
        PdfObject::String(PdfString::hex(b"Hello"))
    );
}

#[test]
fn name_constructs_and_matches_name_arm() {
    // Name(PdfName::from("Type")) を構築し matches! で Name 腕に入ることを確認する
    let obj = PdfObject::Name(PdfName::from("Type"));
    assert!(matches!(obj, PdfObject::Name(_)));
}

#[test]
fn as_name_returns_some_for_name() {
    // Name(PdfName::from("Type")) に as_name() を呼ぶと Some(&PdfName::from("Type")) を返すことを確認する
    let name = PdfName::from("Type");
    assert_eq!(
        PdfObject::Name(PdfName::from("Type")).as_name(),
        Some(&name)
    );
}

#[test]
fn as_string_bytes_returns_none_for_non_string_variants() {
    // String 以外（Null/Boolean/Integer/Real/Name/Stream/Reference）では as_string_bytes() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for obj in &variants {
        assert_eq!(obj.as_string_bytes(), None);
    }
}

#[test]
fn as_name_returns_none_for_non_name_variants() {
    // Name 以外（Null/Boolean/Integer/Real/String/Stream/Reference）では as_name() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for obj in &variants {
        assert_eq!(obj.as_name(), None);
    }
}

#[test]
fn as_string_bytes_returns_empty_slice_for_empty_string() {
    // 空バイト列の String(PdfString::literal(b"")) は as_string_bytes() で Some(空スライス) を返すことを確認する
    assert_eq!(
        PdfObject::String(PdfString::literal(b"")).as_string_bytes(),
        Some(b"".as_slice())
    );
}

#[test]
fn as_string_bytes_preserves_nul_non_utf8_and_high_bytes() {
    // String(PdfString::literal(vec![0x00, 0x80, 0xFF])) を as_string_bytes() で取り出すと同一バイト列がテキスト解釈されず忠実に返ることを確認する
    let obj = PdfObject::String(PdfString::literal(vec![0x00, 0x80, 0xFF]));
    assert_eq!(obj.as_string_bytes(), Some([0x00, 0x80, 0xFF].as_slice()));
}

#[test]
fn same_content_strings_are_equal() {
    // 同内容の String 同士は == で等価になることを確認する
    assert_eq!(
        PdfObject::String(PdfString::literal(b"x")),
        PdfObject::String(PdfString::literal(b"x"))
    );
}

#[test]
fn different_content_strings_are_not_equal() {
    // 異内容の String 同士は != で非等価になることを確認する
    assert_ne!(
        PdfObject::String(PdfString::literal(b"x")),
        PdfObject::String(PdfString::literal(b"y"))
    );
}

#[test]
fn same_content_names_are_equal() {
    // 同内容の Name 同士は == で等価になることを確認する
    assert_eq!(
        PdfObject::Name(PdfName::from("A")),
        PdfObject::Name(PdfName::from("A"))
    );
}

#[test]
fn string_and_name_with_same_bytes_are_not_equal() {
    // 同一バイト内容でも String と Name は異バリアントのため != で非等価になることを確認する
    assert_ne!(
        PdfObject::String(PdfString::literal(b"Type")),
        PdfObject::Name(PdfName::from("Type"))
    );
}

#[test]
fn as_name_then_as_bytes_roundtrips() {
    // Name の as_name().unwrap().as_bytes() が元の名前バイト列 b"Type" を返す（後段借用経路）ことを確認する
    let obj = PdfObject::Name(PdfName::from("Type"));
    assert_eq!(obj.as_name().unwrap().as_bytes(), b"Type");
}

#[test]
fn clone_preserves_string_and_name_and_keeps_original_usable() {
    // String/Name を clone() すると複製の中身が元と一致し、元も引き続き使用可能なことを確認する
    let original_string = PdfObject::String(PdfString::literal(b"abc"));
    let cloned_string = original_string.clone();
    assert_eq!(cloned_string.as_string_bytes(), Some(b"abc".as_slice()));
    assert_eq!(original_string.as_string_bytes(), Some(b"abc".as_slice()));

    let original_name = PdfObject::Name(PdfName::from("Type"));
    let cloned_name = original_name.clone();
    assert_eq!(cloned_name.as_name().unwrap().as_bytes(), b"Type");
    assert_eq!(original_name.as_name().unwrap().as_bytes(), b"Type");
}

#[test]
fn as_string_bytes_preserves_long_multibyte_bytes() {
    // 長い+多バイトUTF-8（"名前"）混在のバイト列が as_string_bytes() で往復一致することを確認する（任意・優先度低）
    let mut bytes = "名前".as_bytes().to_vec();
    bytes.resize(bytes.len() + 300, b'a');
    let obj = PdfObject::String(PdfString::literal(bytes.clone()));
    assert_eq!(obj.as_string_bytes(), Some(bytes.as_slice()));
}

#[test]
fn strings_compare_on_trailing_byte() {
    // 複数バイト・末尾1バイト差で String の等価/非等価が判定されることを確認する（任意・優先度低）
    assert_eq!(
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::String(PdfString::literal(b"abc"))
    );
    assert_ne!(
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::String(PdfString::literal(b"abd"))
    );
}

#[test]
fn debug_format_contains_string_and_name_variant_names() {
    // Debug 出力が String / Name のバリアント名を含むことを確認する（任意・優先度低）
    assert!(format!("{:?}", PdfObject::String(PdfString::literal(b"x"))).contains("String"));
    assert!(format!("{:?}", PdfObject::Name(PdfName::from("A"))).contains("Name"));
}
