use crate::lexer::outcome::LexOutcome;
use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn peek_token_at_returns_n_th_token_in_input_order() {
    // peek_token_at(0/1/2) が入力順に Integer(1/2/3) を返すことを確認する
    let mut lex = lexer(b"1 2 3");
    assert_eq!(
        lex.peek_token_at(0),
        LexOutcome::Lexed(&Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.peek_token_at(1),
        LexOutcome::Lexed(&Token::Primitive(Primitive::Integer(2)))
    );
    assert_eq!(
        lex.peek_token_at(2),
        LexOutcome::Lexed(&Token::Primitive(Primitive::Integer(3)))
    );
}

#[test]
fn take_token_follows_peek_at_order() {
    // peek_token_at で 0/1/2 を覗いた後、take_token を 3 回呼ぶと同じ順序で取り出せることを確認する
    let mut lex = lexer(b"1 2 3");
    let _ = lex.peek_token_at(0);
    let _ = lex.peek_token_at(1);
    let _ = lex.peek_token_at(2);
    assert_eq!(
        lex.take_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.take_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(2)))
    );
    assert_eq!(
        lex.take_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(3)))
    );
}
