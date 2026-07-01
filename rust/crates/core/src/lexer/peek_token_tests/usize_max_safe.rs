use super::lexer;

#[test]
fn peek_token_at_usize_max_returns_none_without_panic() {
    // n.checked_add(1) のオーバーフロー吸収により peek_token_at(usize::MAX) は panic せず None
    let mut lex = lexer(b"42");
    assert_eq!(lex.peek_token_at(usize::MAX), None);
}

#[test]
fn peek_token_at_usize_max_minus_one_returns_none_without_panic() {
    // checked_add 経路で usize::MAX - 1 も panic せず None
    let mut lex = lexer(b"42");
    assert_eq!(lex.peek_token_at(usize::MAX - 1), None);
}
