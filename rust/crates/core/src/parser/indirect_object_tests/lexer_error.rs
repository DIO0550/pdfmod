use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseError;
use super::parser;

#[test]
fn parse_indirect_object_lexer_error_at_generation_position() {
    // lexer malformed(G 位置): b"1 <48656C" は世代取得位置の未終端 hex で LexerError を位置 2 で返す
    let mut p = parser(b"1 <48656C");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::lexer_error_at(ByteOffset::new(2)))
    );
}

#[test]
fn parse_indirect_object_lexer_error_at_obj_position() {
    // lexer malformed(obj 位置): b"1 0 <48656C" は obj 要求位置の未終端 hex で LexerError を位置 4 で返す
    let mut p = parser(b"1 0 <48656C");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::lexer_error_at(ByteOffset::new(4)))
    );
}

#[test]
fn parse_indirect_object_lexer_error_at_content_position() {
    // lexer malformed(content 位置): b"1 0 obj <48656C" は content 位置の未終端 hex で LexerError を位置 8 で返す
    let mut p = parser(b"1 0 obj <48656C");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::lexer_error_at(ByteOffset::new(8)))
    );
}
