use super::super::super::byte_offset::ByteOffset;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
#[allow(clippy::approx_constant)]
fn parse_object_returns_array_for_iso_3_7_example() {
    // ISO 32000-1 §3.7 仕様例 b"[549 3.14 false (Ralph) /SomeName]" を 5 種スカラ混在配列としてパースし、末尾到達 position が入力長一致であることを確認する
    let input: &[u8] = b"[549 3.14 false (Ralph) /SomeName]";
    let mut p = parser(input);
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(549),
            PdfObject::Real(3.14),
            PdfObject::Boolean(false),
            PdfObject::String(b"Ralph".to_vec()),
            PdfObject::Name(PdfName::new(b"SomeName".to_vec())),
        ]))
    );
    assert_eq!(p.position(), ByteOffset::new(input.len() as u64));
}

#[test]
fn parse_object_returns_array_for_media_box() {
    // MediaBox 相当の実 PDF 由来 b"[0 0 612 792]" が 4 要素 Integer の Array として返ることを確認する
    let mut p = parser(b"[0 0 612 792]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(0),
            PdfObject::Integer(0),
            PdfObject::Integer(612),
            PdfObject::Integer(792),
        ]))
    );
}
