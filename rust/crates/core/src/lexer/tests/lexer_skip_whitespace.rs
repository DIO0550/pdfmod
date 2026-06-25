use super::super::Lexer;

// ---------- Phase 4: skip_whitespace ----------

#[test]
fn skip_whitespace_consumes_all_six_whitespace_bytes() {
    // ISO 32000 の whitespace 6 バイト（NUL/TAB/LF/FF/CR/SP）を全消費することを確認する
    let mut lexer = Lexer::new(b"\x00\t\n\x0c\r ");
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), 6);
}

#[test]
fn skip_whitespace_stops_at_regular_byte() {
    // 通常バイトに到達したら停止し peek がそのバイトを指すことを確認する
    let mut lexer = Lexer::new(b"  abc");
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), 2);
    assert_eq!(lexer.peek(), Some(b'a'));
}

#[test]
fn skip_whitespace_stops_at_delimiter_byte() {
    // delimiter '(' に到達したら停止し peek がそのバイトを指すことを確認する
    let mut lexer = Lexer::new(b"  (");
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), 2);
    assert_eq!(lexer.peek(), Some(b'('));
}

#[test]
fn skip_whitespace_handles_consecutive_newlines() {
    // 連続する LF を 3 つすべてスキップすることを確認する
    let mut lexer = Lexer::new(b"\n\n\n");
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), 3);
}

#[test]
fn skip_whitespace_handles_mixed_cr_lf_crlf() {
    // 混在する CR/LF/CRLF を独立 whitespace として 1 バイトずつ全消費することを確認する
    let mut lexer = Lexer::new(b"\r\n\r\n\r");
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), 5);
}

#[test]
fn skip_whitespace_is_noop_for_empty_input() {
    // 空入力で skip_whitespace が panic せず position が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), 0);
}

#[test]
fn skip_whitespace_is_noop_at_eof() {
    // EOF 状態で skip_whitespace が panic せず position 不変であることを確認する
    let mut lexer = Lexer::new(b"ab");
    lexer.advance();
    lexer.advance();
    let pos_before = lexer.position();
    lexer.skip_whitespace();
    assert_eq!(lexer.position(), pos_before);
}
