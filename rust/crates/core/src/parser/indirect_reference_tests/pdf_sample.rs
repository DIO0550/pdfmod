use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::{parser, reference};

/// ISO 32000-1 §7.3.10 の Page オブジェクト値部に登場する代表的辞書サンプル。
/// `/Contents 15 0 R` の値が `Reference(15, 0)` として認識されることを確認するための入力。
const ISO_SAMPLE: &[u8] = b"<</Type /Page /Contents 15 0 R>>";

fn parse_dict(input: &[u8]) -> PdfDictionary {
    let mut p = parser(input);
    match p.parse_object().expect("dictionary should parse") {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    }
}

#[test]
fn parse_object_resolves_contents_entry_to_reference() {
    // ISO §7.3.10 サンプル: /Contents エントリ値が Reference(15, 0) として保持されることを確認する
    let dict = parse_dict(ISO_SAMPLE);
    assert_eq!(
        dict.get(&PdfName::new(b"Contents".to_vec())),
        Some(&reference(15, 0))
    );
}

#[test]
fn parse_object_preserves_type_name_entry_alongside_reference() {
    // ISO §7.3.10 サンプル: /Type エントリは Name("Page") のままで、Reference 認識の副作用を受けないことを確認する
    let dict = parse_dict(ISO_SAMPLE);
    assert_eq!(
        dict.get(&PdfName::new(b"Type".to_vec())),
        Some(&PdfObject::Name(PdfName::new(b"Page".to_vec())))
    );
}
