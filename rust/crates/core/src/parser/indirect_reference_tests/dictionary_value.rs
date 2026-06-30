use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::{parser, reference};

fn parse_dict(input: &[u8]) -> PdfDictionary {
    let mut p = parser(input);
    match p.parse_object().expect("dictionary should parse") {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    }
}

#[test]
fn parse_object_returns_dictionary_with_single_reference_value() {
    // 辞書値: b"<</K 3 0 R>>" は K → Reference(3, 0) を保持する辞書を返すことを確認する
    let dict = parse_dict(b"<</K 3 0 R>>");
    assert_eq!(dict.len(), 1);
    assert_eq!(
        dict.get(&PdfName::new(b"K".to_vec())),
        Some(&reference(3, 0))
    );
}

#[test]
fn parse_object_returns_dictionary_with_two_reference_values() {
    // 辞書値: b"<</A 1 0 R /B 2 0 R>>" は A→Reference(1,0)、B→Reference(2,0) を保持することを確認する
    let dict = parse_dict(b"<</A 1 0 R /B 2 0 R>>");
    assert_eq!(dict.len(), 2);
    assert_eq!(
        dict.get(&PdfName::new(b"A".to_vec())),
        Some(&reference(1, 0))
    );
    assert_eq!(
        dict.get(&PdfName::new(b"B".to_vec())),
        Some(&reference(2, 0))
    );
}

#[test]
fn parse_object_returns_nested_dictionary_with_inner_reference_value() {
    // ネスト辞書: b"<</X <</Y 1 0 R>>>>" は X → Dictionary({Y: Reference(1,0)}) を保持することを確認する
    let outer = parse_dict(b"<</X <</Y 1 0 R>>>>");
    let inner = match outer.get(&PdfName::new(b"X".to_vec())) {
        Some(PdfObject::Dictionary(d)) => d,
        other => panic!("expected nested Dictionary at /X, got {:?}", other),
    };
    assert_eq!(inner.len(), 1);
    assert_eq!(
        inner.get(&PdfName::new(b"Y".to_vec())),
        Some(&reference(1, 0))
    );
}
