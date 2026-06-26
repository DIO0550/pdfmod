use super::super::*;

#[test]
fn read_literal_string_reads_empty_string() {
    // b"()" で Some(b"") を返し pos == 2 で停止することを確認する
    let mut lexer = Lexer::new(b"()");
    assert_eq!(lexer.read_literal_string(), Some(b"".to_vec()));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_literal_string_reads_simple_ascii() {
    // b"(abc)" で Some(b"abc") を返し pos == 5 で停止することを確認する
    let mut lexer = Lexer::new(b"(abc)");
    assert_eq!(lexer.read_literal_string(), Some(b"abc".to_vec()));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_literal_string_reads_single_byte_string() {
    // 1 バイト文字列 b"(x)" で Some(b"x") を返し pos == 3 で停止することを確認する（桁数別の三角測量）
    let mut lexer = Lexer::new(b"(x)");
    assert_eq!(lexer.read_literal_string(), Some(b"x".to_vec()));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_literal_string_success_at_mid_buffer_advances_correctly() {
    // b"x(a)y" で先頭 1 バイト advance 後に呼び出すと Some(b"a")・pos == 4・後続 b'y' が見えることを確認する
    let mut lexer = Lexer::new(b"x(a)y");
    let _ = lexer.advance();
    assert_eq!(lexer.read_literal_string(), Some(b"a".to_vec()));
    assert_eq!(lexer.position(), 4);
    assert_eq!(lexer.peek(), Some(b'y'));
}

#[test]
fn read_literal_string_success_stops_just_after_closing_paren() {
    // b"(a)b" で Some(b"a")・pos == 3 で停止し、閉じ ')' の直後で後続 b'b' を消費しないことを確認する
    let mut lexer = Lexer::new(b"(a)b");
    assert_eq!(lexer.read_literal_string(), Some(b"a".to_vec()));
    assert_eq!(lexer.position(), 3);
    assert_eq!(lexer.peek(), Some(b'b'));
}
