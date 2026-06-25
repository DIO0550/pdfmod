use super::super::Lexer;

#[test]
fn advance_consumes_one_byte_and_returns_some() {
    // advance が先頭バイトを返して position を 1 進めることを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.advance(), Some(b'a'));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn advance_returns_each_byte_in_order() {
    // advance を 3 回連続で呼び 'a','b','c' の順に返ることを確認する（三角測量）
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.advance(), Some(b'a'));
    assert_eq!(lexer.advance(), Some(b'b'));
    assert_eq!(lexer.advance(), Some(b'c'));
}

#[test]
fn advance_returns_none_at_eof_without_moving_pos() {
    // EOF 時の advance が None を返し position が不変であることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.advance(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn advance_returns_none_for_empty_input() {
    // 空入力の advance が None を返し position が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.advance(), None);
    assert_eq!(lexer.position(), 0);
}
