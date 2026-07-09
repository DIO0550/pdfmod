use super::super::error::ParseErrorKind;
use super::parse_stream_err;

#[test]
fn parse_stream_object_returns_missing_endstream_when_name_token_follows_data() {
    // data 後に endstream ではなく Name トークンが来た場合、MissingEndstream を返すことを確認する
    let input = b"<< /Length 4 >>\nstream\ndata\n/Foo";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_integer_token_follows_data() {
    // data 後に endstream ではなく Integer トークンが来た場合、MissingEndstream を返すことを確認する
    let input = b"<< /Length 4 >>\nstream\ndata\n42";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_missing_endstream_when_input_ends_before_endstream() {
    // data 後に endstream 前で EOF に達した場合、MissingEndstream を返すことを確認する
    // （実装計画 §4.1 / §9.3 に従い、EOF は UnexpectedEof ではなく MissingEndstream として扱う）
    let input = b"<< /Length 4 >>\nstream\ndata";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::MissingEndstream),
        "expected MissingEndstream, got {:?}",
        err.kind
    );
}
