use crate::lexer::outcome::LexOutcome;
use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn next_token_returns_buffered_peek_before_advancing_cursor() {
    // peek_token で buffer に積んだトークンを、続く next_token が先に返却することを確認する
    // （peek 系 API と next_token を混在させても token が skip/reorder されない契約）
    let mut lex = lexer(b"1 2");
    assert_eq!(
        lex.peek_token(),
        LexOutcome::Lexed(&Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(2)))
    );
}

#[test]
fn next_token_drains_buffer_in_order_after_consecutive_peek_at() {
    // peek_token_at(0/1/2) でバッファに 3 個積んだ後、next_token を 3 回呼ぶと同じ順序で返ることを確認する
    let mut lex = lexer(b"1 2 3");
    let _ = lex.peek_token_at(0);
    let _ = lex.peek_token_at(1);
    let _ = lex.peek_token_at(2);
    assert_eq!(
        lex.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(2)))
    );
    assert_eq!(
        lex.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(3)))
    );
}

#[test]
fn next_token_without_prior_peek_reads_directly_from_input() {
    // peek を経由せず next_token を呼んだ場合は従来通り入力バイトから lex されることを確認する
    // （バッファ空時の挙動が既存と変わらないことの保証）
    let mut lex = lexer(b"42");
    assert_eq!(
        lex.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(42)))
    );
}
