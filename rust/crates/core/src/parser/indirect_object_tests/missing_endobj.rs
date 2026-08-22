use super::super::super::byte_offset::ByteOffset;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::super::error::{ParseError, ParseErrorKind};
use super::parser;
use crate::lexer::token_kind::TokenKind;

#[test]
fn parse_indirect_object_missing_endobj_at_eof_returns_unexpected_eof() {
    // endobj 欠落(content 後 EOF): b"1 0 obj 42" は content 読取後に入力が尽きて UnexpectedEof を末尾(10)で返す
    let mut p = parser(b"1 0 obj 42");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_eof_at(ByteOffset::new(10)))
    );
}

#[test]
fn parse_indirect_object_non_endobj_token_returns_unexpected_token() {
    // endobj 位置に別トークン: b"1 0 obj 42 [1]" は content 後に配列開始が来て UnexpectedToken{TokenKind::ArrayBegin} を [ 位置(11)で返す
    let mut p = parser(b"1 0 obj 42 [1]");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(11),
            TokenKind::ArrayBegin
        ))
    );
}

#[test]
fn parse_indirect_object_empty_content_returns_unexpected_obj_end() {
    // 空 content: b"12 0 obj endobj" は obj 直後に endobj が来て content 読みの parse_object が UnexpectedToken{TokenKind::ObjEnd} を endobj 位置(9)で返す
    let mut p = parser(b"12 0 obj endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(9),
            TokenKind::ObjEnd
        ))
    );
}

#[test]
fn parse_indirect_object_stream_content_returns_stream_object_for_empty_data() {
    // 以前は stream 昇格未サポートで UnexpectedToken{TokenKind::StreamBegin} を返すテストだったが、
    // 本 Issue で parse_indirect_object 内の stream 昇格を実装したため、成功パスに書き換えている。
    // 期待: /Length 0 の空データストリームが PdfObject::Stream として復元される
    let mut p = parser(b"1 0 obj << /Length 0 >> stream\nendstream endobj");
    let indirect = p
        .parse_indirect_object()
        .expect("stream content indirect object must parse");
    let stream = match indirect.object() {
        PdfObject::Stream(stream) => stream,
        other => panic!("expected Stream, got {other:?}"),
    };
    assert!(stream.data().is_empty());
    let length = stream
        .dictionary()
        .get(&PdfName::new(b"Length".to_vec()))
        .expect("dictionary must retain /Length after stream promotion");
    assert_eq!(length, &PdfObject::Integer(0));
}

#[test]
fn parse_indirect_object_returns_missing_endobj_error_for_non_endobj_token_after_stream() {
    // stream 昇格後に endobj ではなく別トークン (Name) が来た場合、
    // expect_token(ObjEnd) が UnexpectedToken を返すことを確認する（既存の missing_endobj 系統との整合）
    let mut p = parser(b"1 0 obj << /Length 0 >> stream\nendstream /Extra endobj");
    let err = p
        .parse_indirect_object()
        .expect_err("non-endobj token after stream must error");
    assert!(matches!(
        err,
        ParseError {
            kind: ParseErrorKind::UnexpectedToken { .. },
            ..
        }
    ));
}
