use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::{parser, reference};

/// ISO 32000-1 §7.3.10 の Page 定義サンプル（辞書・参照混在 content）。
const PAGE_SAMPLE: &[u8] = b"12 0 obj << /Type /Page /Contents 15 0 R >> endobj";

#[test]
fn parse_page_sample_extracts_object_id() {
    // Page サンプルをパースし id() == ObjectId(12,0) が抽出されることを確認する
    let mut p = parser(PAGE_SAMPLE);
    let io = p.parse_indirect_object().expect("page sample should parse");
    assert_eq!(io.id().object_number().value(), 12);
    assert_eq!(io.id().generation_number().value(), 0);
}

#[test]
fn parse_page_sample_content_is_dictionary() {
    // Page サンプルの content 種別が PdfObject::Dictionary であることを確認する
    let mut p = parser(PAGE_SAMPLE);
    let io = p.parse_indirect_object().expect("page sample should parse");
    assert!(matches!(io.object(), PdfObject::Dictionary(_)));
}

#[test]
fn parse_page_sample_contents_entry_is_reference() {
    // Page サンプルの辞書内 /Contents が Reference(15,0) として認識されることを確認する
    let mut p = parser(PAGE_SAMPLE);
    let io = p.parse_indirect_object().expect("page sample should parse");
    let dict = match io.object() {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    };
    assert_eq!(
        dict.get(&PdfName::from("Contents")),
        Some(&reference(15, 0))
    );
}

#[test]
fn parse_page_sample_type_entry_is_name() {
    // Page サンプルの辞書内 /Type が Name("Page") で、参照認識の副作用を受けないことを確認する
    let mut p = parser(PAGE_SAMPLE);
    let io = p.parse_indirect_object().expect("page sample should parse");
    let dict = match io.object() {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    };
    assert_eq!(
        dict.get(&PdfName::from("Type")),
        Some(&PdfObject::Name(PdfName::from("Page")))
    );
}
