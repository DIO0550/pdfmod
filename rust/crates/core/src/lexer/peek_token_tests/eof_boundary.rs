use crate::lexer::outcome::LexOutcome;
use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn peek_token_at_one_returns_eof_after_single_token() {
    // 1 トークンしか含まない入力で peek_token_at(1) が Eof を返し、
    // バッファに保留した peek_token_at(0) は壊れず後続 take_token で取り出せることを確認する
    let mut lex = lexer(b"42");
    assert_eq!(
        lex.peek_token_at(0),
        LexOutcome::Lexed(&Token::Primitive(Primitive::Integer(42)))
    );
    assert_eq!(lex.peek_token_at(1), LexOutcome::Eof);
    assert_eq!(
        lex.take_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(42)))
    );
}

#[test]
fn peek_then_take_then_peek_returns_eof() {
    // peek -> take で 1 トークン消費後、再度 peek が Eof を返すことを確認する
    let mut lex = lexer(b"42");
    let _ = lex.peek_token();
    let _ = lex.take_token();
    assert_eq!(lex.peek_token(), LexOutcome::Eof);
}

#[test]
fn take_token_drains_all_tokens_then_returns_eof() {
    // 複数トークン入力を順次 take_token で消費し、末尾で Eof を返すことを確認する
    let mut lex = lexer(b"1 2 3");
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
    assert_eq!(lex.take_token(), LexOutcome::Eof);
}
