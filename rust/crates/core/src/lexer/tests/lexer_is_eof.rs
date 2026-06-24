use super::super::Lexer;

#[test]
fn is_eof_returns_false_initially_and_true_after_consuming_all() {
    // 初期状態は EOF でなく、全バイト消費後に EOF となることを確認する
    let mut lexer = Lexer::new(b"ab");
    assert!(!lexer.is_eof());
    lexer.advance();
    lexer.advance();
    assert!(lexer.is_eof());
}

#[test]
fn is_eof_returns_true_for_empty_input_initially() {
    // 空入力の初期状態（pos=0, len=0）で is_eof が即 true となる境界を確認する
    let lexer = Lexer::new(&[]);
    assert!(lexer.is_eof());
}
