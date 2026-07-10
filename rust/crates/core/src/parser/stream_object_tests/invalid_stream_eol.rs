use super::super::error::{ParseError, ParseErrorKind};
use super::{byte_offset, parse_stream_err};

/// `<< /Length 4 >>\nstream` は 22 バイトなので、`stream` キーワード消費直後の位置は 22。
/// 本ファイルの全テストがこの prefix を共有するため、`InvalidStreamEol` の期待 position はすべて 22 になる。
const AFTER_STREAM_POS: u64 = 22;

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_only_cr_follows_stream_keyword() {
    // stream キーワード直後が CR 単体（LF が続かない）の場合、InvalidStreamEol を返すことを確認する（DC-11）
    let input = b"<< /Length 4 >>\nstream\rdata\rendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidStreamEol,
            position: byte_offset(AFTER_STREAM_POS),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_space_follows_stream_keyword() {
    // stream キーワード直後が SP（EOL でない）の場合、InvalidStreamEol を返すことを確認する（DC-4: skip_whitespace を経由しない）
    let input = b"<< /Length 4 >>\nstream data\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidStreamEol,
            position: byte_offset(AFTER_STREAM_POS),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_tab_follows_stream_keyword() {
    // stream キーワード直後が TAB（EOL でない）の場合、InvalidStreamEol を返すことを確認する
    let input = b"<< /Length 4 >>\nstream\tdata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidStreamEol,
            position: byte_offset(AFTER_STREAM_POS),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_stream_eol_when_input_ends_after_stream_keyword() {
    // stream キーワード直後で EOF に達した場合、InvalidStreamEol を返すことを確認する（EolKind::at が None）
    let input = b"<< /Length 4 >>\nstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidStreamEol,
            position: byte_offset(AFTER_STREAM_POS),
        }
    );
}
