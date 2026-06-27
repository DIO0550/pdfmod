use super::super::*;

#[test]
fn read_literal_string_unknown_escape_drops_backslash() {
    // b"(\\x)" で未知エスケープがバックスラッシュ捨て + 'x' 保持となり pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\x)");
    assert_eq!(lexer.read_literal_string(), Some(b"x".to_vec()));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_literal_string_unknown_escape_with_exclamation() {
    // b"(\\!)" で未知エスケープ '!' をそのまま保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\!)");
    assert_eq!(lexer.read_literal_string(), Some(b"!".to_vec()));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_literal_string_unknown_escape_with_uppercase_letter() {
    // b"(\\A)" で 8 進数字外の 'A' を未知エスケープ扱いで保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\A)");
    assert_eq!(lexer.read_literal_string(), Some(b"A".to_vec()));
    assert_eq!(lexer.position(), 4);
}
