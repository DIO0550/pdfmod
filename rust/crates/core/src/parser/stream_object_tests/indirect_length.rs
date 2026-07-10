use super::super::error::{ParseError, ParseErrorKind};
use super::{byte_offset, parse_stream_err};

#[test]
fn parse_stream_object_returns_indirect_length_not_supported_when_length_is_reference() {
    // /Length が間接参照 (5 0 R) の場合、IndirectLengthNotSupported を辞書開始位置 (0) で返すことを確認する（DC-5）
    let input = b"<< /Length 5 0 R >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::IndirectLengthNotSupported,
            position: byte_offset(0),
        }
    );
}
