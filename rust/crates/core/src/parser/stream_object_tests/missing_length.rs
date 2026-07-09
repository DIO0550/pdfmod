use super::super::error::{ParseError, ParseErrorKind};
use super::{byte_offset, parse_stream_err};

#[test]
fn parse_stream_object_returns_missing_length_when_length_key_absent() {
    // /Length エントリが辞書に無い場合、MissingLength を辞書開始位置 (0) で返すことを確認する
    let input = b"<< /Type /XObject >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::MissingLength,
            position: byte_offset(0),
        }
    );
}
