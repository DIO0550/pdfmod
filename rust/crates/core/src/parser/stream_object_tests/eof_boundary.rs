use super::super::error::ParseErrorKind;
use super::parse_stream_err;

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_input_ends_immediately_after_stream_keyword()
{
    // 境界: stream キーワード直後で入力が尽きる場合、InvalidStreamEol を返すことを確認する
    // （EolKind::at が None を返し、CRLF/LF 検証で失敗する）
    let input = b"<< /Length 4 >>\nstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::InvalidStreamEol),
        "expected InvalidStreamEol, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_unexpected_eof_when_input_ends_mid_data() {
    // 境界: EOL 後、Length バイト消費中に入力が尽きる場合、take_bytes が None を返し UnexpectedEof を返すことを確認する
    let input = b"<< /Length 10 >>\nstream\nabc";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::UnexpectedEof),
        "expected UnexpectedEof, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_input_ends_before_endstream_token() {
    // 境界: Length バイト消費後、endstream の直前で入力が尽きる場合、
    // expect_endstream が EOF を MissingEndstream に集約することを確認する（実装計画 §4.1 / §9.3）
    let input = b"<< /Length 4 >>\nstream\ndata";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}
