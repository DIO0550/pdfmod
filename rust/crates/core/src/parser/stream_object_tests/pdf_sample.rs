use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::super::Parser;

/// ISO 32000-1 §7.3.8 の Length を明示したストリームのサンプル。
/// content には ISO §7.3.4.4 相当の Tj によるテキスト描画を含む簡易な形。
const STREAM_SAMPLE: &[u8] =
    b"7 0 obj\n<< /Length 34 >>\nstream\nBT\n/F1 12 Tf\n72 712 Td\n(ABC) Tj\nET\nendstream\nendobj";

#[test]
fn parse_stream_sample_extracts_object_id() {
    // ISO §7.3.8 サンプルの id が ObjectId(7, 0) として抽出されることを確認する
    let mut parser = Parser::new(STREAM_SAMPLE);
    let indirect = parser
        .parse_indirect_object()
        .expect("stream sample should parse");
    assert_eq!(indirect.id().object_number().value(), 7);
    assert_eq!(indirect.id().generation_number().value(), 0);
}

#[test]
fn parse_stream_sample_content_is_stream() {
    // ISO §7.3.8 サンプルの content 種別が PdfObject::Stream であることを確認する
    let mut parser = Parser::new(STREAM_SAMPLE);
    let indirect = parser
        .parse_indirect_object()
        .expect("stream sample should parse");
    assert!(matches!(indirect.object(), PdfObject::Stream(_)));
}

#[test]
fn parse_stream_sample_data_is_content_stream_bytes() {
    // ISO §7.3.8 サンプルの data が /Length 34 バイト分の content stream として復元されることを確認する
    let mut parser = Parser::new(STREAM_SAMPLE);
    let indirect = parser
        .parse_indirect_object()
        .expect("stream sample should parse");
    let stream = match indirect.object() {
        PdfObject::Stream(stream) => stream,
        other => panic!("expected Stream, got {other:?}"),
    };
    assert_eq!(stream.data(), b"BT\n/F1 12 Tf\n72 712 Td\n(ABC) Tj\nET");
    assert_eq!(stream.data().len(), 34);
}

#[test]
fn parse_stream_sample_dictionary_retains_length_entry() {
    // ISO §7.3.8 サンプルの stream 辞書に /Length 34 がそのまま保持されることを確認する
    let mut parser = Parser::new(STREAM_SAMPLE);
    let indirect = parser
        .parse_indirect_object()
        .expect("stream sample should parse");
    let stream = match indirect.object() {
        PdfObject::Stream(stream) => stream,
        other => panic!("expected Stream, got {other:?}"),
    };
    let length = stream
        .dictionary()
        .get(&PdfName::new(b"Length".to_vec()))
        .expect("/Length must remain in the stream dictionary");
    assert_eq!(length, &PdfObject::Integer(34));
}
