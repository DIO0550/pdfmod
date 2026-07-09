use super::super::error::ParseErrorKind;
use super::parse_stream_err;

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_only_cr_follows_stream_keyword() {
    // stream キーワード直後が CR 単体（LF が続かない）の場合、InvalidStreamEol を返すことを確認する（DC-11）
    let input = b"<< /Length 4 >>\nstream\rdata\rendstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::InvalidStreamEol),
        "expected InvalidStreamEol, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_space_follows_stream_keyword() {
    // stream キーワード直後が SP（EOL でない）の場合、InvalidStreamEol を返すことを確認する（DC-4: skip_whitespace を経由しない）
    let input = b"<< /Length 4 >>\nstream data\nendstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::InvalidStreamEol),
        "expected InvalidStreamEol, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_tab_follows_stream_keyword() {
    // stream キーワード直後が TAB（EOL でない）の場合、InvalidStreamEol を返すことを確認する
    let input = b"<< /Length 4 >>\nstream\tdata\nendstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::InvalidStreamEol),
        "expected InvalidStreamEol, got {:?}",
        err.kind
    );
}

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_input_ends_after_stream_keyword() {
    // stream キーワード直後で EOF に達した場合、InvalidStreamEol を返すことを確認する（EolKind::at が None）
    let input = b"<< /Length 4 >>\nstream";
    let err = parse_stream_err(input);
    assert!(
        matches!(err.kind, ParseErrorKind::InvalidStreamEol),
        "expected InvalidStreamEol, got {:?}",
        err.kind
    );
}
