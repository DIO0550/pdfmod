use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_propagates_lexer_error_when_generation_lookahead_hits_malformed_hex() {
    // fail-fast: b"1 <48656C" は G 取得位置で未終端 hex が現れるため、parse_object は
    // Integer(1) を呼び出し元に渡さず LexerError を pos=2 で伝播することを確認する
    let mut p = parser(b"1 <48656C");
    let err = p
        .parse_object()
        .expect_err("lookahead must propagate lexer error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(2));
}

#[test]
fn parse_object_propagates_lexer_error_when_third_token_lookahead_hits_malformed_hex() {
    // fail-fast: b"1 0 <48656C" は Token3 取得位置で未終端 hex が現れるため、parse_object は
    // Integer(1) を呼び出し元に渡さず LexerError を pos=4 で伝播することを確認する
    let mut p = parser(b"1 0 <48656C");
    let err = p
        .parse_object()
        .expect_err("lookahead must propagate lexer error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(4));
}
