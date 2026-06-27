use super::super::*;

#[test]
fn read_hex_string_returns_none_for_non_hex_letter() {
    // 非 16 進文字 <XY> で None を返し pos == 0 へ巻き戻ることを確認する
    let mut lexer = Lexer::new(b"<XY>");
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_non_hex_after_valid() {
    // 有効 16 進数字に続く不正文字 <48G> で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"<48G>");
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_non_ascii_byte() {
    // 非 ASCII バイト 0xFF が内部に出現したら None・pos == 0 巻き戻しを確認する
    let input = [b'<', 0xFF, b'>'];
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_delimiter_inside() {
    // delimiter '(' が内部に混入した <48(65> で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"<48(65>");
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_double_open_angle() {
    // '<<' を read_hex_string 単独で呼んでも panic せず None・pos == start 巻き戻しを確認する
    let mut lexer1 = Lexer::new(b"<<");
    assert_eq!(lexer1.read_hex_string(), None);
    assert_eq!(lexer1.position(), 0);

    let mut lexer2 = Lexer::new(b"<< /Type");
    assert_eq!(lexer2.read_hex_string(), None);
    assert_eq!(lexer2.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_unterminated_eof() {
    // 閉じ '>' が無い <48656C で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"<48656C");
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_lone_open_angle() {
    // '<' 単独で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"<");
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_hex_string_returns_none_for_open_followed_by_whitespace_eof() {
    // '< ' のみで EOF に達した場合に None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"< ");
    assert_eq!(lexer.read_hex_string(), None);
    assert_eq!(lexer.position(), 0);
}
