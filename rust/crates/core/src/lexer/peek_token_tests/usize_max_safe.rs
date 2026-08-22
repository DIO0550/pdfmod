use crate::lexer::outcome::LexOutcome;

use super::lexer;

#[test]
fn peek_token_at_usize_max_returns_eof_without_panic() {
    // n.checked_add(1) のオーバーフロー吸収により peek_token_at(usize::MAX) は panic せず Eof
    let mut lex = lexer(b"42");
    assert_eq!(lex.peek_token_at(usize::MAX), LexOutcome::Eof);
}

#[test]
fn peek_token_at_usize_max_minus_one_returns_eof_without_panic() {
    // オーバーフローしないが到達不能な位置でも、バッファを埋め尽くして EOF に到達し Eof を返す
    let mut lex = lexer(b"42");
    assert_eq!(lex.peek_token_at(usize::MAX - 1), LexOutcome::Eof);
}
