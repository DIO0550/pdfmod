use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;
use crate::lexer::token_kind::TokenKind;

#[test]
fn parse_object_returns_unexpected_token_when_object_number_overflows_i64() {
    // 値域外 (N > i64::MAX): lexer が "99999999999999999999" を Token::Keyword 化するため
    // lookahead は不発火、parse_object は pos=0 で UnexpectedToken{Keyword} を返すことを確認する
    let mut p = parser(b"99999999999999999999 0 R");
    let err = p
        .parse_object()
        .expect_err("oversized integer must surface as keyword");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual: TokenKind::Keyword
        }
    );
    assert_eq!(err.position, ByteOffset::new(0));
}
