use super::super::Lexer;

// ---------- Phase 5: skip_comment ----------

#[test]
fn skip_comment_returns_none_when_pos_not_at_percent() {
    // 先頭が '%' でないとき skip_comment が None を返し pos が不変であることを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.skip_comment(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn skip_comment_consumes_until_lf_and_returns_body_without_percent() {
    // LF 終端コメントで本文 'hello' を返し終端 LF までスキップすることを確認する
    let mut lexer = Lexer::new(b"%hello\nrest");
    assert_eq!(lexer.skip_comment(), Some(b"hello".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}

#[test]
fn skip_comment_consumes_until_cr_and_returns_body() {
    // CR 単独終端コメントで本文 'hi' を返し終端 CR までスキップすることを確認する
    let mut lexer = Lexer::new(b"%hi\rrest");
    assert_eq!(lexer.skip_comment(), Some(b"hi".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}

#[test]
fn skip_comment_consumes_until_crlf_and_returns_body() {
    // CRLF 終端コメントで本文 'c' を返し CRLF を 2 バイトでまとめてスキップすることを確認する
    let mut lexer = Lexer::new(b"%c\r\nrest");
    assert_eq!(lexer.skip_comment(), Some(b"c".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}

#[test]
fn skip_comment_handles_empty_comment_terminated_by_lf() {
    // LF 終端の空コメント '%\n' で本文が空スライスになることを確認する
    let mut lexer = Lexer::new(b"%\nrest");
    assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}

#[test]
fn skip_comment_handles_empty_comment_terminated_by_cr() {
    // CR 単独終端の空コメント '%\r' で本文が空スライスになることを確認する
    let mut lexer = Lexer::new(b"%\rrest");
    assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}

#[test]
fn skip_comment_handles_empty_comment_terminated_by_crlf() {
    // CRLF 終端の空コメント '%\r\n' で本文が空スライスになることを確認する
    let mut lexer = Lexer::new(b"%\r\nrest");
    assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}

#[test]
fn skip_comment_handles_lone_percent_at_eof() {
    // EOF 直前の単独 '%' で本文が空スライスになり EOF に達することを確認する
    let mut lexer = Lexer::new(b"%");
    assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
    assert!(lexer.is_eof());
}

#[test]
fn skip_comment_handles_eof_without_eol() {
    // EOL なしで EOF に到達するコメントが末尾までを本文として返すことを確認する
    let mut lexer = Lexer::new(b"%comment_without_newline");
    assert_eq!(
        lexer.skip_comment(),
        Some(b"comment_without_newline".as_slice())
    );
    assert!(lexer.is_eof());
}

#[test]
fn skip_comment_handles_pdf_header_style() {
    // PDF ヘッダ風 '%PDF-1.7\n' の本文を返し終端 LF までスキップすることを確認する
    let mut lexer = Lexer::new(b"%PDF-1.7\n");
    assert_eq!(lexer.skip_comment(), Some(b"PDF-1.7".as_slice()));
    assert_eq!(lexer.peek(), None);
}

#[test]
fn skip_comment_handles_eof_marker_style() {
    // '%%EOF' で 2 つ目の '%' を本文の一部として扱い末尾までスキップすることを確認する
    let mut lexer = Lexer::new(b"%%EOF");
    assert_eq!(lexer.skip_comment(), Some(b"%EOF".as_slice()));
    assert!(lexer.is_eof());
}

#[test]
fn skip_comment_returns_none_for_empty_input() {
    // 空入力に対する skip_comment が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.skip_comment(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn skip_comment_at_mid_buffer_advances_correctly() {
    // 中間位置 'x%c\nz' で advance 後の skip_comment が本文 'c' を返し peek が 'z' になることを確認する
    let mut lexer = Lexer::new(b"x%c\nz");
    lexer.advance();
    assert_eq!(lexer.skip_comment(), Some(b"c".as_slice()));
    assert_eq!(lexer.peek(), Some(b'z'));
}

#[test]
fn skip_comment_body_outlives_subsequent_peek_call() {
    // 戻り値本文の lifetime が 'a であり後続 peek 呼び出し後も保持できることを確認する
    let mut lexer = Lexer::new(b"%hello\nrest");
    let body = lexer.skip_comment();
    assert_eq!(lexer.peek(), Some(b'r'));
    assert_eq!(body, Some(b"hello".as_slice()));
}

#[test]
fn skip_comment_consumes_body_containing_pdf_delimiters() {
    // コメント本文に PDF デリミタ ( ) / < > を含んでもトークン化されず EOL まで丸ごと本文として
    // 消費され、次トークンの読み取り位置が正しく EOL 直後になることを確認する
    let mut lexer = Lexer::new(b"%foo(bar)/Baz<01>\nrest");
    assert_eq!(lexer.skip_comment(), Some(b"foo(bar)/Baz<01>".as_slice()));
    assert_eq!(lexer.peek(), Some(b'r'));
}
