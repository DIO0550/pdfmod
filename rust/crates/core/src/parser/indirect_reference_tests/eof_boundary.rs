use super::super::super::byte_offset::ByteOffset;
use super::super::super::object::pdf_object::PdfObject;
use super::super::error::ParseErrorKind;
use super::{parser, reference};

#[test]
fn parse_object_returns_unexpected_eof_after_a_single_reference() {
    // EOF 境界: b"1 0 R" を 1 度 parse した後の 2 回目は UnexpectedEof を返すことを確認する
    let mut p = parser(b"1 0 R");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
    let err = p.parse_object().expect_err("second call must EOF");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_returns_trailing_integer_after_reference_in_short_stream() {
    // EOF 境界: b"1 0 R 3" は 1 回目に Reference、2 回目に Integer(3)、3 回目に UnexpectedEof を返すことを確認する
    let mut p = parser(b"1 0 R 3");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(3)));
    let err = p.parse_object().expect_err("third call must EOF");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parser_position_returns_buffer_head_pos_after_one_zero_lookahead_failure() {
    // 論理カーソル: b"1 0" を 1 度 parse した直後、Integer(0) はバッファに保留中なので
    // position() は lexer.position() (=3) ではなくバッファ先頭の pos (=2) を返すことを確認する
    let mut p = parser(b"1 0");
    assert_eq!(p.parse_object(), Ok(PdfObject::Integer(1)));
    assert_eq!(p.position(), ByteOffset::new(2));
}
