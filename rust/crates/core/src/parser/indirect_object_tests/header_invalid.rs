use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseError;
use super::parser;
use crate::lexer::token_kind::TokenKind;

#[test]
fn parse_indirect_object_missing_generation_returns_unexpected_obj_begin() {
    // ヘッダ不正(G欠落): b"12 obj" は 2 番目に obj が来て UnexpectedToken{TokenKind::ObjBegin} を obj 位置(3)で返す
    let mut p = parser(b"12 obj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(3),
            TokenKind::ObjBegin
        ))
    );
}

#[test]
fn parse_indirect_object_non_obj_keyword_returns_unexpected_keyword() {
    // ヘッダ不正(obj でない): b"12 0 x" は 3 番目が Keyword で UnexpectedToken{TokenKind::Keyword} を x 位置(5)で返す
    let mut p = parser(b"12 0 x");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(5),
            TokenKind::Keyword
        ))
    );
}

#[test]
fn parse_indirect_object_negative_object_number_returns_unexpected_primitive() {
    // ヘッダ不正(N<0): b"-1 0 obj" はオブジェクト番号が負で UnexpectedToken{TokenKind::Primitive} を位置 0 で返す
    let mut p = parser(b"-1 0 obj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(0),
            TokenKind::Primitive
        ))
    );
}

#[test]
fn parse_indirect_object_negative_generation_returns_unexpected_primitive() {
    // ヘッダ不正(G<0): b"12 -1 obj" は世代番号が負で UnexpectedToken{TokenKind::Primitive} を -1 位置(3)で返す
    let mut p = parser(b"12 -1 obj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(3),
            TokenKind::Primitive
        ))
    );
}

#[test]
fn parse_indirect_object_generation_over_u16_max_returns_unexpected_primitive() {
    // ヘッダ不正(G>u16::MAX): b"12 65536 obj" は世代番号が範囲外で UnexpectedToken{TokenKind::Primitive} を 65536 位置(3)で返す
    let mut p = parser(b"12 65536 obj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_token_at(
            ByteOffset::new(3),
            TokenKind::Primitive
        ))
    );
}
