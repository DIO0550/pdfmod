use super::super::*;

#[test]
fn read_hex_string_succeeds_after_advance() {
    // advance 後の pos=1 から x<41> を読み開始して pos == 5 へ進むことを確認する
    let mut lexer = Lexer::new(b"x<41>");
    let _ = lexer.advance();
    assert_eq!(lexer.read_hex_string(), Some(vec![0x41]));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_hex_string_rewinds_to_mid_buffer_position_on_failure() {
    // advance 後の pos=1 から x<XY> で失敗し pos == 1 へ巻き戻ることを確認する
    let mut lexer = Lexer::new(b"x<XY>");
    let _ = lexer.advance();
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_hex_string_rewinds_to_mid_buffer_position_on_unterminated() {
    // advance 後の pos=1 から x<48 で未終端時に pos == 1 へ巻き戻ることを確認する
    let mut lexer = Lexer::new(b"x<48");
    let _ = lexer.advance();
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 1);
}
