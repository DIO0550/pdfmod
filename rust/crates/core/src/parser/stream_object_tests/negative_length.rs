use super::super::error::{ParseError, ParseErrorKind};
use super::{byte_offset, parse_stream_err};

#[test]
fn parse_stream_object_returns_negative_length_when_length_is_minus_one() {
    // /Length が負の値 (-1) の場合、NegativeLength を辞書開始位置 (0) で返すことを確認する（DC-6: unit variant）
    let input = b"<< /Length -1 >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::NegativeLength,
            position: byte_offset(0),
        }
    );
}
