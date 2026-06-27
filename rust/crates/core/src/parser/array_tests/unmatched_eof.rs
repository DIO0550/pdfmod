use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_returns_unexpected_eof_for_open_bracket_only() {
    // 入力 b"[" で `[` 直後 EOF が UnexpectedEof, position=1 で返ることを確認する
    let mut p = parser(b"[");
    let err = p.parse_object().expect_err("unclosed array must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(1));
}

#[test]
fn parse_object_returns_unexpected_eof_for_elements_then_eof() {
    // 入力 b"[1 2" で要素途中 EOF が UnexpectedEof, position=4 で返ることを確認する
    let mut p = parser(b"[1 2");
    let err = p.parse_object().expect_err("eof after elements must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(4));
}

#[test]
fn parse_object_returns_unexpected_eof_for_nested_open_eof() {
    // 入力 b"[[1 " でネスト中 EOF が内側 parse_array_body の None arm で UnexpectedEof, position=4 (末尾) で返ることを確認する
    let mut p = parser(b"[[1 ");
    let err = p.parse_object().expect_err("nested eof must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(4));
}

#[test]
fn parse_object_returns_unexpected_eof_for_trailing_space_then_eof() {
    // 入力 b"[1 2 3" で末尾要素直後 EOF が UnexpectedEof, position=6 で返ることを確認する
    let mut p = parser(b"[1 2 3");
    let err = p.parse_object().expect_err("trailing eof must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(6));
}

#[test]
fn parse_object_returns_unexpected_eof_for_double_open_bracket() {
    // 入力 b"[[" でネスト入口直後 EOF が UnexpectedEof, position=2 で返ることを確認する
    let mut p = parser(b"[[");
    let err = p
        .parse_object()
        .expect_err("double open bracket must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(2));
}

#[test]
fn parse_object_returns_unexpected_eof_for_nested_close_then_eof() {
    // 入力 b"[[1] " でネスト出口待ち EOF が外側 parse_array_body の None arm で UnexpectedEof, position=5 (末尾) で返ることを確認する
    let mut p = parser(b"[[1] ");
    let err = p
        .parse_object()
        .expect_err("nested close then eof must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(5));
}

#[test]
fn parse_object_handles_comment_without_eol_then_eof() {
    // 入力 b"[1 %comment" でコメントが EOL なしで EOF に到達する場合、lexer 挙動に応じて UnexpectedEof または LexerError のいずれかになることを確認する
    let mut p = parser(b"[1 %comment");
    let err = p
        .parse_object()
        .expect_err("comment without eol then eof must error");
    assert!(matches!(
        err.kind,
        ParseErrorKind::UnexpectedEof | ParseErrorKind::LexerError
    ));
}

#[test]
fn parse_object_returns_unexpected_eof_for_triple_nested_open_then_int_eof() {
    // 入力 b"[[[1" で 3 段ネスト中 EOF が UnexpectedEof で内側 parse_array_body の None arm から伝播し、position=4 (末尾) に固定されることを確認する
    let mut p = parser(b"[[[1");
    let err = p.parse_object().expect_err("triple nested eof must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(4));
}
