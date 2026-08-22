use crate::lexer::outcome::LexOutcome;

use super::lexer;

#[test]
fn peek_token_returns_malformed_for_lonely_dict_end_marker() {
    // 単独の `>` は malformed。is_eof() を追い問い合わせずに Malformed として判別できることを確認する
    let mut lex = lexer(b">");
    assert_eq!(lex.peek_token(), LexOutcome::Malformed { position: 0 });
}

#[test]
fn peek_token_returns_eof_for_empty_input() {
    // 空入力では peek_token が Eof を返すことを確認する
    let mut lex = lexer(b"");
    assert_eq!(lex.peek_token(), LexOutcome::Eof);
}

#[test]
fn peek_token_returns_malformed_for_lonely_left_brace() {
    // 単独の `{` も仕様外 delimiter として Malformed になることを確認する
    let mut lex = lexer(b"{");
    assert_eq!(lex.peek_token(), LexOutcome::Malformed { position: 0 });
}

#[test]
fn peek_token_at_one_returns_malformed_position_of_the_offending_byte() {
    // 有効トークンの後ろに不正バイトがある入力で、peek_token_at(1) が不正バイト位置を運ぶことを確認する
    let mut lex = lexer(b"1 >");
    assert_eq!(lex.peek_token_at(1), LexOutcome::Malformed { position: 2 });
}

#[test]
fn take_token_returns_malformed_position_after_consuming_a_token() {
    // 1 トークン take して消費した後の take_token が、不正バイト位置を運ぶことを確認する
    let mut lex = lexer(b"1 >");
    assert!(matches!(lex.take_token(), LexOutcome::Lexed(_)));
    assert_eq!(lex.take_token(), LexOutcome::Malformed { position: 2 });
}

#[test]
fn peek_token_reports_malformed_position_past_a_transparent_comment() {
    // Comment 透過スキップの先が malformed のとき、position は `>` の位置であり
    // Comment 開始位置（0）ではないことを確認する
    let mut lex = lexer(b"% comment\n>");
    assert_eq!(lex.peek_token(), LexOutcome::Malformed { position: 10 });
}
