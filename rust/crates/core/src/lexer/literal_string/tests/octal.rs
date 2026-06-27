use super::super::*;

#[test]
fn read_literal_string_decodes_octal_three_digits() {
    // b"(\\101)" で 3 桁 8 進 'A' (0x41) にデコードし pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\101)");
    assert_eq!(lexer.read_literal_string(), Some(b"A".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_decodes_octal_two_digits_followed_by_space() {
    // b"(\\12 )" で 2 桁 8 進終端後 LF + space を保持し pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\12 )");
    assert_eq!(lexer.read_literal_string(), Some(b"\n ".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_decodes_octal_one_digit_followed_by_8() {
    // b"(\\189)" で 1 桁 8 進 0x01 + リテラル '8' '9' を保持し pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\189)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x0189".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_decodes_octal_one_digit_followed_by_paren() {
    // b"(\\1)" で 1 桁 8 進 0x01 のみ保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\1)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x01".to_vec()));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_literal_string_decodes_octal_greedy_three_digits_then_literal() {
    // b"(\\1234)" で 3 桁 greedy → 'S' (0x53) + リテラル '4' を保持し pos == 7 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\1234)");
    assert_eq!(lexer.read_literal_string(), Some(b"S4".to_vec()));
    assert_eq!(lexer.position(), 7);
}

#[test]
fn read_literal_string_decodes_octal_overflow_mod_256() {
    // b"(\\777)" で 8 進 511 を下位 8 ビット採用で 0xFF にデコードし pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\777)");
    assert_eq!(lexer.read_literal_string(), Some(b"\xFF".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_decodes_octal_zero() {
    // b"(\\0)" で 1 桁 8 進 0 を NUL にデコードし pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\0)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_literal_string_decodes_octal_400_wraps_to_zero() {
    // b"(\\400)" で 8 進 256 を下位 8 ビット採用で 0x00 にデコードし pos == 6 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\400)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_literal_string_decodes_octal_000_three_digit_zero() {
    // b"(\\000)" で 3 桁全 0 を NUL にデコードし pos == 6 を返し greedy が 3 桁で打ち止めとなることを確認する
    let mut lexer = Lexer::new(b"(\\000)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
    assert_eq!(lexer.position(), 6);
}
