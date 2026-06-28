use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

const ISO_SAMPLE: &[u8] = b"<< /Type /Example
/Subtype /DictionaryExample
/Version 0.01
/IntegerItem 12
/StringItem (a string)
/Subdictionary << /Item1 0.4
                  /Item2 true
                  /LastItem (not!)
               >>
>>";

#[test]
fn parse_object_returns_iso_specification_sample_dictionary() {
    // ISO 32000-1 §7.3.7 仕様例 (UC-2) をパースし、トップレベル 6 エントリ・サブ辞書 3 エントリが各型を正しく保持することを確認する
    let dict = parse_dict(ISO_SAMPLE);
    assert_eq!(dict.len(), 6);
    assert_eq!(
        dict.get(&PdfName::from("Type")),
        Some(&PdfObject::Name(PdfName::from("Example")))
    );
    assert_eq!(
        dict.get(&PdfName::from("Subtype")),
        Some(&PdfObject::Name(PdfName::from("DictionaryExample")))
    );
    let version = dict
        .get(&PdfName::from("Version"))
        .and_then(PdfObject::as_real)
        .expect("Version should be Real");
    assert!((version - 0.01).abs() < 1e-9, "version={}", version);
    assert_eq!(
        dict.get(&PdfName::from("IntegerItem")),
        Some(&PdfObject::Integer(12))
    );
    assert_eq!(
        dict.get(&PdfName::from("StringItem")),
        Some(&PdfObject::String(b"a string".to_vec()))
    );

    let sub = match dict.get(&PdfName::from("Subdictionary")) {
        Some(PdfObject::Dictionary(d)) => d,
        other => panic!("expected /Subdictionary as Dictionary, got {:?}", other),
    };
    assert_eq!(sub.len(), 3);
    let item1 = sub
        .get(&PdfName::from("Item1"))
        .and_then(PdfObject::as_real)
        .expect("Item1 should be Real");
    assert!((item1 - 0.4).abs() < 1e-9, "item1={}", item1);
    assert_eq!(
        sub.get(&PdfName::from("Item2")),
        Some(&PdfObject::Boolean(true))
    );
    assert_eq!(
        sub.get(&PdfName::from("LastItem")),
        Some(&PdfObject::String(b"not!".to_vec()))
    );
}

#[test]
fn parse_object_returns_page_dictionary_with_media_box_array() {
    // PDF page dict の典型構造 b"<< /Type /Page /MediaBox [0 0 612 792] >>" で /Type==Name("Page") と /MediaBox==Array(4 Integer) を確認する
    let dict = parse_dict(b"<< /Type /Page /MediaBox [0 0 612 792] >>");
    assert_eq!(
        dict.get(&PdfName::from("Type")),
        Some(&PdfObject::Name(PdfName::from("Page")))
    );
    assert_eq!(
        dict.get(&PdfName::from("MediaBox")),
        Some(&PdfObject::Array(vec![
            PdfObject::Integer(0),
            PdfObject::Integer(0),
            PdfObject::Integer(612),
            PdfObject::Integer(792),
        ]))
    );
}

#[test]
fn parse_object_is_idempotent_for_iso_sample() {
    // ISO §7.3.7 仕様例を 2 つの独立 Parser で個別にパースした結果が PartialEq で等価になり、Pure Logic 性を満たすことを確認する
    let result1 = parse_dict(ISO_SAMPLE);
    let result2 = parse_dict(ISO_SAMPLE);
    assert_eq!(result1, result2);
}
