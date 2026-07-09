use super::super::super::byte_offset::ByteOffset;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::super::error::{ParseError, ParseErrorKind};
use super::super::Parser;

#[test]
fn parse_indirect_object_returns_stream_object_end_to_end() {
    // 統合: `N G obj << /Length n >> stream ... endstream endobj` を parse_indirect_object で丸ごと復元し、
    // id / dictionary / data が期待どおり保持されることを確認する（Issue #411 受け入れ基準）
    let input = b"5 3 obj << /Length 11 /Type /XObject >> stream\nHello world\nendstream endobj";
    let mut parser = Parser::new(input);
    let indirect = parser
        .parse_indirect_object()
        .expect("integration parse must succeed");

    assert_eq!(indirect.id().object_number().value(), 5);
    assert_eq!(indirect.id().generation_number().value(), 3);

    let stream = match indirect.object() {
        PdfObject::Stream(stream) => stream,
        other => panic!("expected Stream, got {other:?}"),
    };
    assert_eq!(stream.data(), b"Hello world");

    let length = stream
        .dictionary()
        .get(&PdfName::new(b"Length".to_vec()))
        .expect("/Length must remain in the stream dictionary");
    assert_eq!(length, &PdfObject::Integer(11));

    let type_entry = stream
        .dictionary()
        .get(&PdfName::new(b"Type".to_vec()))
        .expect("/Type must remain in the stream dictionary");
    assert_eq!(type_entry, &PdfObject::Name(PdfName::from("XObject")));
}

#[test]
fn parse_indirect_object_with_dictionary_content_still_returns_dictionary() {
    // 副作用ゼロ検証: 辞書 content の直後に stream が続かない場合は Dictionary のままで、
    // stream 昇格が発火しないことを確認する（DC-7 の副作用限定境界）
    let input = b"1 0 obj << /Type /Catalog >> endobj";
    let mut parser = Parser::new(input);
    let indirect = parser
        .parse_indirect_object()
        .expect("dictionary content must still parse");
    assert!(matches!(indirect.object(), PdfObject::Dictionary(_)));
}

#[test]
fn parse_indirect_object_reports_missing_length_at_dictionary_open_position() {
    // 位置検証（DC-5）: `1 0 obj << ...` で /Length 欠落エラーの position が
    // `<<` の実位置（byte 8）を指すことを確認する。dict_start が obj の直後の空白ではなく、
    // 実トークン開始位置に揃っていることを保証する（Codex 指摘対応）。
    let input = b"1 0 obj << /Filter /FlateDecode >>\nstream\nxxxx\nendstream endobj";
    let mut parser = Parser::new(input);
    let err = parser
        .parse_indirect_object()
        .expect_err("stream without /Length must fail");
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::MissingLength,
            position: ByteOffset::new(8),
        }
    );
}
