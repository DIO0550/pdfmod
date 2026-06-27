use super::super::*;

#[test]
fn read_hex_string_pads_single_digit_with_zero() {
    // <F> が ISO 32000-1 §7.3.4.3 に従い 0xF0 にデコードされることを確認する
    let mut lexer = Lexer::new(b"<F>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xF0]));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_hex_string_pads_three_digits_with_zero() {
    // <ABC> が AB + C0 にデコードされることを確認する（三角測量: 1桁 → 3桁 一般化）
    let mut lexer = Lexer::new(b"<ABC>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xAB, 0xC0]));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_hex_string_pads_five_digits_with_zero() {
    // <48656C6C6> が Hell + 0x60 にデコードされることを確認する
    let mut lexer = Lexer::new(b"<48656C6C6>");
    assert_eq!(
        lexer.read_hex_string(),
        Some(vec![0x48, 0x65, 0x6C, 0x6C, 0x60])
    );
}

#[test]
fn read_hex_string_pads_odd_digit_followed_by_whitespace() {
    // 奇数桁 + 末尾 whitespace <F > が 0xF0 にデコードされ high 状態が '>' 分岐まで保持されることを確認する
    let mut lexer = Lexer::new(b"<F >");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xF0]));
}
