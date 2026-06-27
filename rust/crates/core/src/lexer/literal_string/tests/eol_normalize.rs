use super::super::*;

#[test]
fn read_literal_string_normalizes_bare_lf() {
    // 裸 LF を含む b"(a\nb)" で LF をそのまま保持し pos == 5 を返すことを確認する
    let mut lexer = Lexer::new(b"(a\nb)");
    assert_eq!(lexer.read_literal_string(), Some(b"a\nb".to_vec()));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_literal_string_normalizes_bare_cr_to_lf() {
    // 裸 CR を含む b"(a\rb)" で CR を LF に正規化し pos == 5 を返すことを確認する
    let mut lexer = Lexer::new(b"(a\rb)");
    assert_eq!(lexer.read_literal_string(), Some(b"a\nb".to_vec()));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_literal_string_normalizes_bare_crlf_to_lf() {
    // 裸 CRLF を含む b"(a\r\nb)" で CRLF を 1 個の LF に正規化し pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(a\r\nb)");
    assert_eq!(lexer.read_literal_string(), Some(b"a\nb".to_vec()));
    assert_eq!(lexer.position(), 6);
}
