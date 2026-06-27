use super::super::*;

#[test]
fn read_hex_string_returns_none_for_empty_input() {
    // 空入力で None を返し pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_at_eof() {
    // 1 バイトを advance で消費した EOF 状態で None を返し pos == 1 を維持することを確認する
    let mut lexer = Lexer::new(b"a");
    let _ = lexer.advance();
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_hex_string_returns_none_when_not_starting_with_open_angle() {
    // 先頭が '<' でないバイト（'[' / '(' / '/' / '0' / 'x'）で None・pos == 0 を確認する
    for &b in b"[(/0x" {
        let input = [b];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_hex_string(), None, "byte 0x{:02X}", b);
        assert_eq!(lexer.position(), 0, "byte 0x{:02X}", b);
    }
}

#[test]
fn read_hex_string_returns_none_for_every_leading_whitespace_byte() {
    // whitespace 6 種（NUL/TAB/LF/FF/CR/SP）を先頭に置いた全 6 組で None・pos == 0 を確認する
    for w in [0x00u8, 0x09, 0x0A, 0x0C, 0x0D, 0x20] {
        let input = [w];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_hex_string(), None, "whitespace 0x{:02X}", w);
        assert_eq!(lexer.position(), 0, "whitespace 0x{:02X}", w);
    }
}

#[test]
fn read_hex_string_returns_none_for_leading_delimiters_other_than_open_angle() {
    // delimiter 10 種から '<' を除いた 9 種で None・pos == 0 を確認する
    for d in [b'(', b')', b'>', b'[', b']', b'{', b'}', b'/', b'%'] {
        let input = [d];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_hex_string(), None, "delimiter {:?}", d as char);
        assert_eq!(lexer.position(), 0, "delimiter {:?}", d as char);
    }
}
