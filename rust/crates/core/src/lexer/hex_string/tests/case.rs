use super::super::*;

#[test]
fn read_hex_string_accepts_lowercase_hex() {
    // 小文字 16 進数字 <abcdef> が正しくデコードされることを確認する
    let mut lexer = Lexer::new(b"<abcdef>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
}

#[test]
fn read_hex_string_accepts_uppercase_hex() {
    // 大文字 16 進数字 <ABCDEF> が正しくデコードされることを確認する
    let mut lexer = Lexer::new(b"<ABCDEF>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
}

#[test]
fn read_hex_string_accepts_mixed_case_hex() {
    // 大小混在 <aBcDeF> / <AbCdEf> が同じバイト列にデコードされることを確認する
    let mut lexer1 = Lexer::new(b"<aBcDeF>");
    assert_eq!(lexer1.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
    let mut lexer2 = Lexer::new(b"<AbCdEf>");
    assert_eq!(lexer2.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
}

#[test]
fn read_hex_string_treats_upper_and_lower_as_equivalent() {
    // 大文字小文字の入れ替え <aA> と <Aa> が共に 0xAA を返すことを確認する
    let mut lexer1 = Lexer::new(b"<aA>");
    assert_eq!(lexer1.read_hex_string(), Some(vec![0xAA]));
    let mut lexer2 = Lexer::new(b"<Aa>");
    assert_eq!(lexer2.read_hex_string(), Some(vec![0xAA]));
}
