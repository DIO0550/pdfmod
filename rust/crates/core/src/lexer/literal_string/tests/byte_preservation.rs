use super::super::*;

#[test]
fn read_literal_string_preserves_nul_byte() {
    // b"(\x00)" で NUL バイトをそのまま保持し pos == 3 を返すことを確認する
    let mut lexer = Lexer::new(b"(\x00)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_literal_string_preserves_high_byte() {
    // b"(\xFF)" で 0xFF バイトをそのまま保持し pos == 3 を返すことを確認する
    let mut lexer = Lexer::new(b"(\xFF)");
    assert_eq!(lexer.read_literal_string(), Some(b"\xFF".to_vec()));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_literal_string_preserves_non_utf8_sequence() {
    // b"(\x80\xC0)" で非 UTF-8 連続バイト列をそのまま保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\x80\xC0)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x80\xC0".to_vec()));
    assert_eq!(lexer.position(), 4);
}
