use super::super::*;

#[test]
fn read_hex_string_skips_space_between_digits() {
    // 数字間の SP が無視され <48 65 6C 6C 6F> が b"Hello" にデコードされることを確認する
    let mut lexer = Lexer::new(b"<48 65 6C 6C 6F>");
    assert_eq!(lexer.read_hex_string(), Some(b"Hello".to_vec()));
}

#[test]
fn read_hex_string_skips_newlines_and_tabs_between_digits() {
    // TAB/LF/CR/FF が無視され混在 whitespace でも b"Hello" にデコードされることを確認する
    let mut lexer = Lexer::new(b"<48\t65\n6C\r6C\x0C6F>");
    assert_eq!(lexer.read_hex_string(), Some(b"Hello".to_vec()));
}

#[test]
fn read_hex_string_skips_every_whitespace_byte_between_digits() {
    // whitespace 6 種を 1 種ずつ挟んだ全パターンで b"Hi" にデコードされることを確認する
    for w in [0x00u8, 0x09, 0x0A, 0x0C, 0x0D, 0x20] {
        let mut input = Vec::new();
        input.push(b'<');
        input.extend_from_slice(b"48");
        input.push(w);
        input.extend_from_slice(b"69");
        input.push(b'>');
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_hex_string(),
            Some(vec![0x48, 0x69]),
            "whitespace 0x{:02X}",
            w
        );
    }
}

#[test]
fn read_hex_string_skips_whitespace_inside_pair() {
    // ペア内部の whitespace <4 8> が 1 バイト 0x48 にデコードされ high 状態が破壊されないことを確認する
    let mut lexer = Lexer::new(b"<4 8>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x48]));
}

#[test]
fn read_hex_string_skips_leading_whitespace_after_open() {
    // 開き '<' 直後の whitespace < 4865> が正しくデコードされることを確認する
    let mut lexer = Lexer::new(b"< 4865>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x48, 0x65]));
}

#[test]
fn read_hex_string_skips_trailing_whitespace_before_close() {
    // 閉じ '>' 直前の whitespace <4865 > が正しくデコードされることを確認する
    let mut lexer = Lexer::new(b"<4865 >");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x48, 0x65]));
}

#[test]
fn read_hex_string_treats_whitespace_only_as_empty() {
    // whitespace のみ <   > が空バイト列 vec![] にデコードされることを確認する
    let mut lexer = Lexer::new(b"<   >");
    assert_eq!(lexer.read_hex_string(), Some(vec![]));
}

#[test]
fn read_hex_string_skips_null_byte_inside() {
    // NUL は PDF §7.2.2 で whitespace 6 種の 1 つでありスキップされることを確認する
    let input = [b'<', 0x00, b'>'];
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_hex_string(), Some(vec![]));
}
