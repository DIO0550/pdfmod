use super::super::super::byte_offset::ByteOffset;
use super::super::error::{ParseError, ParseErrorKind};
use super::parser;

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
    // endobj 位置に別トークン: b"1 0 obj 42 [1]" は content 後に配列開始が来て UnexpectedToken{"ArrayBegin"} を [ 位置(11)で返す
    let mut p = parser(b"1 0 obj 42 [1]");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(11),
            "ArrayBegin"
        ))
    );
}

#[test]
fn parse_indirect_object_empty_content_returns_unexpected_obj_end() {
    // 空 content: b"12 0 obj endobj" は obj 直後に endobj が来て content 読みの parse_object が UnexpectedToken{"ObjEnd"} を endobj 位置(9)で返す
    let mut p = parser(b"12 0 obj endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(9),
            "ObjEnd"
        ))
    );
}

#[test]
fn parse_indirect_object_stream_content_fails_stably_at_stream_begin() {
    // stream は対象外(安定失敗): 辞書を content 読取後 endobj 位置に stream(スコープ外)が来て UnexpectedToken{"StreamBegin"} を返す
    let mut p = parser(b"1 0 obj << /Length 0 >> stream\nendstream endobj");
    assert!(matches!(
        p.parse_indirect_object(),
        Err(ParseError {
            kind: ParseErrorKind::UnexpectedToken {
                actual_kind: "StreamBegin"
            },
            ..
        })
    ));
}
