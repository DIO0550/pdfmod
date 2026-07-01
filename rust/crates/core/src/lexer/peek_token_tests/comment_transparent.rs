use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn peek_token_skips_leading_comments_and_returns_following_integer() {
    // 連続する Comment を透過スキップして直後の Integer を返すことを確認する
    let mut lex = lexer(b"% a\n% b\n42");
    assert_eq!(
        lex.peek_token(),
        Some(&Token::Primitive(Primitive::Integer(42)))
    );
}

#[test]
fn peek_token_returns_none_for_comments_only_input() {
    // Comment のみで終端する入力では peek_token が None かつ is_eof()==true を確認する
    let mut lex = lexer(b"% a\n% b\n");
    assert_eq!(lex.peek_token(), None);
    assert!(lex.is_eof());
}

#[test]
fn take_token_skips_leading_comments_and_returns_following_integer() {
    // peek を経由せず直接 take_token を呼んでも Comment が透過スキップされることを確認する
    let mut lex = lexer(b"% a\n% b\n42");
    assert_eq!(
        lex.take_token(),
        Some(Token::Primitive(Primitive::Integer(42)))
    );
}

#[test]
fn peek_token_at_skips_interleaved_comments_across_indices() {
    // peek_token_at(0/1/2) が token 間の Comment を透過スキップして Integer(1/2/3) を返すことを確認する
    // try_parse_indirect_reference 相当の N G R に Comment が挟まる入力パターン
    let mut lex = lexer(b"1 % between\n 2 % more\n 3");
    assert_eq!(
        lex.peek_token_at(0),
        Some(&Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.peek_token_at(1),
        Some(&Token::Primitive(Primitive::Integer(2)))
    );
    assert_eq!(
        lex.peek_token_at(2),
        Some(&Token::Primitive(Primitive::Integer(3)))
    );
    // バッファに保留された値を順次 take_token で取り出せることも確認
    assert_eq!(
        lex.take_token(),
        Some(Token::Primitive(Primitive::Integer(1)))
    );
    assert_eq!(
        lex.take_token(),
        Some(Token::Primitive(Primitive::Integer(2)))
    );
    assert_eq!(
        lex.take_token(),
        Some(Token::Primitive(Primitive::Integer(3)))
    );
}
