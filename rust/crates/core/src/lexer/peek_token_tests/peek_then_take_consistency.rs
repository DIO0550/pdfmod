use crate::lexer::outcome::LexOutcome;
use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn peek_token_then_take_token_returns_same_integer() {
    // peek_token で参照取得した値が、続く take_token でも同じ値として取り出せることを確認する
    let mut lex = lexer(b"42");
    assert_eq!(
        lex.peek_token(),
        LexOutcome::Lexed(&Token::Primitive(Primitive::Integer(42)))
    );
    assert_eq!(
        lex.take_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(42)))
    );
}

#[test]
fn take_token_without_prior_peek_returns_first_token() {
    // peek を経由せず直接 take_token を呼んだ場合に先頭トークンが取得できることを確認する
    let mut lex = lexer(b"42");
    assert_eq!(
        lex.take_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(42)))
    );
}
