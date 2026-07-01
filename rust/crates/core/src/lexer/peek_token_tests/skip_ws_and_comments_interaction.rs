use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn skip_whitespace_and_comments_does_not_destroy_buffered_token() {
    // peek 後に skip_whitespace_and_comments を呼んでもバッファ内容は破壊されず、
    // 続く take_token は peek 済みトークンを返すことを確認する
    let mut lex = lexer(b"42  % trailing comment\n7");
    let peeked = lex.peek_token().cloned();
    assert_eq!(peeked, Some(Token::Primitive(Primitive::Integer(42))));
    lex.skip_whitespace_and_comments();
    assert_eq!(
        lex.take_token(),
        Some(Token::Primitive(Primitive::Integer(42)))
    );
}

#[test]
fn skip_whitespace_and_comments_does_not_panic_when_buffer_holds_token() {
    // バッファに peek 済みトークンがある状態で skip_whitespace_and_comments を呼んでも panic しないことを確認する
    let mut lex = lexer(b"42 7");
    let _ = lex.peek_token();
    lex.skip_whitespace_and_comments();
}
