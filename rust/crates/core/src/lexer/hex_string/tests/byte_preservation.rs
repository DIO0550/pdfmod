use super::super::*;

#[test]
fn read_hex_string_preserves_utf8_japanese_bytes() {
    // <E697A5> が「日」の UTF-8 3 バイトをそのまま保持することを確認する
    let mut lexer = Lexer::new(b"<E697A5>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xE6, 0x97, 0xA5]));
}

#[test]
fn read_hex_string_preserves_consecutive_utf8_multibyte() {
    // <E697A5E69CACE8AA9E> が「日本語」UTF-8 9 バイトをそのまま保持することを確認する
    let mut lexer = Lexer::new(b"<E697A5E69CACE8AA9E>");
    assert_eq!(
        lexer.read_hex_string(),
        Some(vec![0xE6, 0x97, 0xA5, 0xE6, 0x9C, 0xAC, 0xE8, 0xAA, 0x9E])
    );
}

#[test]
fn read_hex_string_preserves_high_bytes_at_boundary() {
    // 高位バイト境界 <80FF> が 0x80 と 0xFF をそのまま保持することを確認する
    let mut lexer = Lexer::new(b"<80FF>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x80, 0xFF]));
}

#[test]
fn read_hex_string_preserves_null_and_max_byte() {
    // NUL と最大値の組み合わせ <00FF> が 0x00 と 0xFF をそのまま保持することを確認する
    let mut lexer = Lexer::new(b"<00FF>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x00, 0xFF]));
}

#[test]
fn read_hex_string_preserves_invalid_utf8_sequence() {
    // UTF-8 として不正な <C080> も忠実に保持されることを確認する（lexer は UTF-8 を仮定しない）
    let mut lexer = Lexer::new(b"<C080>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xC0, 0x80]));
}
