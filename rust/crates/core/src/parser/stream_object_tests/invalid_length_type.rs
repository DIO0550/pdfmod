use super::super::error::{ParseError, ParseErrorKind};
use super::{byte_offset, parse_stream_err};
use crate::object::object_kind::ObjectKind;

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_real() {
    // /Length が Real の場合、InvalidLengthType { actual: ObjectKind::Real } を辞書開始位置 (0) で返すことを確認する（DC-11: 1 パターン = 1 test）
    let input = b"<< /Length 1.5 >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::Real
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_string() {
    // /Length が String の場合、InvalidLengthType { actual: ObjectKind::String } を返すことを確認する
    let input = b"<< /Length (hi) >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::String
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_name() {
    // /Length が Name の場合、InvalidLengthType { actual: ObjectKind::Name } を返すことを確認する
    let input = b"<< /Length /Big >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::Name
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_array() {
    // /Length が Array の場合、InvalidLengthType { actual: ObjectKind::Array } を返すことを確認する
    let input = b"<< /Length [1 2 3] >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::Array
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_dictionary() {
    // /Length が Dictionary の場合、InvalidLengthType { actual: ObjectKind::Dictionary } を返すことを確認する
    let input = b"<< /Length << /K 1 >> >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::Dictionary
            },
            position: byte_offset(0),
        }
    );
}

#[test]
fn parse_stream_object_returns_invalid_length_type_when_length_is_boolean() {
    // /Length が Boolean の場合、InvalidLengthType { actual: ObjectKind::Boolean } を返すことを確認する
    let input = b"<< /Length true >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::Boolean
            },
            position: byte_offset(0),
        }
    );
}

#[cfg(target_pointer_width = "32")]
#[test]
fn parse_stream_object_returns_length_out_of_range_when_length_exceeds_usize_on_32bit() {
    // 32bit ターゲット限定: /Length が i64 → usize::try_from で失敗する値の場合
    // LengthOutOfRange { value } を実値付きで返し、型不一致（InvalidLengthType）にはならないことを確認する。
    // 2^32 = 4294967296 は 32bit の usize(u32::MAX = 4294967295) に収まらないため
    // 32bit ターゲットでのみ try_from が失敗する（64bit では成功して別の経路に流れるため cfg でガード）。
    let input = b"<< /Length 4294967296 >>\nstream\ndata\nendstream";
    let err = parse_stream_err(input);
    assert_eq!(
        err,
        ParseError {
            kind: ParseErrorKind::LengthOutOfRange {
                value: 4_294_967_296,
            },
            position: byte_offset(0),
        }
    );
}
