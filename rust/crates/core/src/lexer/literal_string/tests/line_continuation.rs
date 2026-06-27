use super::super::*;

#[test]
fn read_literal_string_handles_line_continuation_lf() {
    // b"(a\\\nb)" で \\ + LF が行継続として出力に追加されず pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(a\\\nb)");
    assert_eq!(lexer.read_literal_string(), Some(b"ab".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_handles_line_continuation_cr() {
    // b"(a\\\rb)" で \\ + CR が行継続として出力に追加されず pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(a\\\rb)");
    assert_eq!(lexer.read_literal_string(), Some(b"ab".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_handles_line_continuation_crlf() {
    // b"(a\\\r\nb)" で \\ + CRLF が行継続として出力に追加されず pos == 7 を返すことを確認する
    let mut lexer = Lexer::new(b"(a\\\r\nb)");
    assert_eq!(lexer.read_literal_string(), Some(b"ab".to_vec()));
    assert_eq!(lexer.position(), 7);
}
