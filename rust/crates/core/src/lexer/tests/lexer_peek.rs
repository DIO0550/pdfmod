use super::super::Lexer;

// ---------- Phase 2: peek / peek_at ----------

#[test]
fn peek_returns_first_byte_at_pos_zero() {
    // pos=0 で peek が先頭バイト 'a' を返すことを確認する
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.peek(), Some(b'a'));
}

#[test]
fn peek_does_not_consume_byte() {
    // peek を 2 回連続呼んでも消費されず position が 0 のままであることを確認する
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.peek(), Some(b'a'));
    assert_eq!(lexer.peek(), Some(b'a'));
    assert_eq!(lexer.position(), 0);
}

#[test]
fn peek_returns_none_for_empty_input() {
    // 空入力に対する peek が None を返すことを確認する
    let lexer = Lexer::new(&[]);
    assert_eq!(lexer.peek(), None);
}

#[test]
fn peek_returns_none_at_eof() {
    // EOF まで進めた後の peek が None を返すことを確認する
    let mut lexer = Lexer::new(b"ab");
    lexer.advance();
    lexer.advance();
    assert_eq!(lexer.peek(), None);
}

#[test]
fn peek_at_returns_byte_at_offset() {
    // peek_at(2) が pos+2 のバイト 'c' を返すことを確認する
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.peek_at(2), Some(b'c'));
}

#[test]
fn peek_at_with_offset_zero_returns_same_as_peek() {
    // offset=0 の peek_at が peek と同じ先頭バイトを返すことを確認する
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.peek_at(0), Some(b'a'));
    assert_eq!(lexer.peek_at(0), lexer.peek());
}

#[test]
fn peek_at_with_offset_equal_to_len_returns_none() {
    // checked_add は成功するが slice::get が None を返す境界（pos+offset == input.len()）で None
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.peek_at(3), None);
}

#[test]
fn peek_at_with_usize_max_returns_none() {
    // peek_at(usize::MAX) が checked_add のオーバーフローで None を返し panic しないことを確認する
    let lexer = Lexer::new(b"abc");
    assert_eq!(lexer.peek_at(usize::MAX), None);
}
