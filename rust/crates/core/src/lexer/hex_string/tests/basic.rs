use super::super::*;

#[test]
fn read_hex_string_reads_empty_hex_string() {
    // 空 16 進文字列 <> が Some(vec![]) を返し pos が 2 へ進むことを確認する
    let mut lexer = Lexer::new(b"<>");
    assert_eq!(lexer.read_hex_string(), Some(vec![]));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_hex_string_reads_hello_ascii() {
    // <48656C6C6F> が b"Hello" にデコードされ pos が閉じ '>' 直後 12 を指すことを確認する
    let mut lexer = Lexer::new(b"<48656C6C6F>");
    assert_eq!(lexer.read_hex_string(), Some(b"Hello".to_vec()));
    assert_eq!(lexer.position(), 12);
}

#[test]
fn read_hex_string_reads_single_byte() {
    // <41> が単一バイト 0x41 にデコードされ pos が 4 を指すことを確認する
    let mut lexer = Lexer::new(b"<41>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x41]));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_hex_string_reads_high_bit_bytes() {
    // <FFEE80> が非 ASCII 高位バイト 3 件にデコードされることを確認する
    let mut lexer = Lexer::new(b"<FFEE80>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0xFF, 0xEE, 0x80]));
    assert_eq!(lexer.position(), 8);
}

#[test]
fn read_hex_string_preserves_null_byte() {
    // <0041> が NUL 0x00 と 'A' 0x41 を含むバイト列にデコードされることを確認する
    let mut lexer = Lexer::new(b"<0041>");
    assert_eq!(lexer.read_hex_string(), Some(vec![0x00, 0x41]));
}

#[test]
fn read_hex_string_stops_at_closing_angle_and_leaves_subsequent_token() {
    // 閉じ '>' の直後で停止し後続トークンを消費しないことを 2 入力で確認する
    let mut lexer1 = Lexer::new(b"<41>/Name");
    assert_eq!(lexer1.read_hex_string(), Some(vec![0x41]));
    assert_eq!(lexer1.position(), 4);
    assert_eq!(lexer1.peek(), Some(b'/'));

    let mut lexer2 = Lexer::new(b"<41> 0 R");
    assert_eq!(lexer2.read_hex_string(), Some(vec![0x41]));
    assert_eq!(lexer2.position(), 4);
    assert_eq!(lexer2.peek(), Some(b' '));
}
