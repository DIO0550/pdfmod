use super::super::Lexer;

// ---------- Phase 6: skip_whitespace_and_comments ----------

#[test]
fn skip_ws_and_comments_stops_at_regular_byte() {
    // 空白のみの入力で peek が通常バイト 'a' を指して停止することを確認する
    let mut lexer = Lexer::new(b"  abc");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'a'));
}

#[test]
fn skip_ws_and_comments_handles_alternating_sequence() {
    // 空白とコメントが交互に続く入力で最終的に peek が 'X' を指すことを確認する
    let mut lexer = Lexer::new(b" %a\n %b\n X");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'X'));
}

#[test]
fn skip_ws_and_comments_handles_consecutive_comments() {
    // 連続する 3 つのコメントを順次スキップして peek が 'Z' を指すことを確認する
    let mut lexer = Lexer::new(b"%a\n%b\n%c\nZ");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'Z'));
}

#[test]
fn skip_ws_and_comments_handles_crlf_separated_consecutive_comments() {
    // CRLF 区切りの連続コメントでも合成 API が peek 'Z' に到達することを確認する
    let mut lexer = Lexer::new(b"%a\r\n%b\r\n%c\r\nZ");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'Z'));
}

#[test]
fn skip_ws_and_comments_handles_eol_less_eof_comment() {
    // EOL なしの末尾コメントを panic せずに最後まで読み EOF に達することを確認する
    let mut lexer = Lexer::new(b" %trailing_without_eol");
    lexer.skip_whitespace_and_comments();
    assert!(lexer.is_eof());
}

#[test]
fn skip_ws_and_comments_is_noop_for_empty_input() {
    // 空入力で合成 API が panic せず EOF を返すことを確認する
    let mut lexer = Lexer::new(&[]);
    lexer.skip_whitespace_and_comments();
    assert!(lexer.is_eof());
}

#[test]
fn skip_ws_and_comments_stops_at_delimiter_not_percent() {
    // '%' 以外の delimiter '(' で停止し peek がそのバイトを指すことを確認する
    let mut lexer = Lexer::new(b"   (");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'('));
}
