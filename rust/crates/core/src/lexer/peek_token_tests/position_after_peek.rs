use crate::lexer::token::{Primitive, Token};

use super::lexer;

#[test]
fn peek_token_with_pos_matches_take_token_with_pos() {
    // peek_token_with_pos が返す pos と直後の take_token_with_pos が返す pos が一致することを確認する
    let mut lex = lexer(b"   42");
    let (peeked_tok, peeked_pos) = lex.peek_token_with_pos().expect("peek should yield");
    assert_eq!(peeked_tok, &Token::Primitive(Primitive::Integer(42)));
    let peeked_pos_copy = peeked_pos;
    let (taken_tok, taken_pos) = lex.take_token_with_pos().expect("take should yield");
    assert_eq!(taken_tok, Token::Primitive(Primitive::Integer(42)));
    assert_eq!(taken_pos, peeked_pos_copy);
}

#[test]
fn position_after_peek_returns_buffer_head_pos() {
    // peek 後の lexer.position() がバッファ先頭エントリの pos（カーソルではなく）を返すことを確認する
    let mut lex = lexer(b"   42 7");
    let _ = lex.peek_token();
    // "42" の開始位置は 3
    assert_eq!(lex.position(), 3);
}

#[test]
fn position_returns_cursor_pos_when_buffer_is_empty() {
    // バッファが空のときは self.pos（カーソル位置）が返ることを確認する
    let lex = lexer(b"abc");
    assert_eq!(lex.position(), 0);
}

#[test]
fn cursor_position_returns_raw_pos_distinct_from_position_after_peek() {
    // peek 後に position() がバッファ先頭 pos、cursor_position() が生のカーソル位置を返し
    // 両者が異なる値であることを直接アサートする（lookahead 中の malformed 報告で使い分け前提）
    let mut lex = lexer(b"   42 7");
    let _ = lex.peek_token();
    // "42" の開始位置は 3、cursor は "42" を読み終えて 5 まで進んでいる
    assert_eq!(lex.position(), 3);
    assert_eq!(lex.cursor_position(), 5);
    assert_ne!(lex.position(), lex.cursor_position());
}

#[test]
fn cursor_position_equals_position_when_buffer_is_empty() {
    // バッファが空のときは position() と cursor_position() が同じ値（self.pos）を返すことを確認する
    let lex = lexer(b"abc");
    assert_eq!(lex.position(), lex.cursor_position());
    assert_eq!(lex.cursor_position(), 0);
}

#[test]
fn take_token_with_pos_without_prior_peek_returns_token_start_pos() {
    // peek を経由せず直接 take_token_with_pos を呼んだ場合、戻り値の pos が
    // skip_whitespace 後のトークン開始バイト位置と一致することを確認する
    let mut lex = lexer(b"   42 7");
    let (tok, pos) = lex.take_token_with_pos().expect("take should yield");
    assert_eq!(tok, Token::Primitive(Primitive::Integer(42)));
    // "42" の開始位置は leading 3 spaces をスキップ後の 3
    assert_eq!(pos, 3);
    let (tok2, pos2) = lex.take_token_with_pos().expect("take should yield");
    assert_eq!(tok2, Token::Primitive(Primitive::Integer(7)));
    // "7" の開始位置は "42" + space で 6
    assert_eq!(pos2, 6);
}
