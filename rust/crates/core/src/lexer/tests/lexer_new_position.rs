use super::super::Lexer;

#[test]
fn new_with_empty_input_sets_pos_zero() {
    // 空入力で Lexer を構築すると position が 0 になることを確認する
    let lexer = Lexer::new(&[]);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn new_with_non_empty_input_sets_pos_zero() {
    // 非空入力で Lexer を構築しても初期 position は 0 であることを確認する
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.position(), 0);
}

#[test]
fn position_returns_current_pos_after_advance() {
    // advance を 2 回呼んだ後の position が 2 になることを確認する（三角測量）
    let mut lexer = Lexer::new(b"abc");
    lexer.advance();
    lexer.advance();
    assert_eq!(lexer.position(), 2);
}
