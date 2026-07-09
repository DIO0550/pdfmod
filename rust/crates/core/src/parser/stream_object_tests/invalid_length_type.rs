use super::super::error::{ParseError, ParseErrorKind};
use super::{byte_offset, parse_stream_err};

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_real() {
    // /Length が Real の場合、InvalidLengthType { actual_kind: "Real" } を辞書開始位置 (0) で返すことを確認する（DC-11: 1 パターン = 1 test）
    let input = b"<< /Length 1.5 >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual_kind: "Real"
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_string() {
    // /Length が String の場合、InvalidLengthType { actual_kind: "String" } を返すことを確認する
    let input = b"<< /Length (hi) >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual_kind: "String"
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_name() {
    // /Length が Name の場合、InvalidLengthType { actual_kind: "Name" } を返すことを確認する
    let input = b"<< /Length /Big >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual_kind: "Name"
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_array() {
    // /Length が Array の場合、InvalidLengthType { actual_kind: "Array" } を返すことを確認する
    let input = b"<< /Length [1 2 3] >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual_kind: "Array"
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_dictionary() {
    // /Length が Dictionary の場合、InvalidLengthType { actual_kind: "Dictionary" } を返すことを確認する
    let input = b"<< /Length << /K 1 >> >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual_kind: "Dictionary"
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_boolean() {
    // /Length が Boolean の場合、InvalidLengthType { actual_kind: "Boolean" } を返すことを確認する
    let input = b"<< /Length true >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual_kind: "Boolean"
            },
            position: byte_offset(0),
        }
    );
}
