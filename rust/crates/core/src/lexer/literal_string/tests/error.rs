use super::super::*;

#[test]
fn read_literal_string_returns_none_for_unterminated_string() {
    // 閉じ ')' のない b"(abc" で None を返し pos == 0 に完全巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(abc");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_returns_none_for_unterminated_nested() {
    // ネスト未閉鎖 b"(a(b" で None を返し pos == 0 に完全巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(a(b");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_returns_none_for_lone_open_paren() {
    // 単独 '(' で None を返し pos == 0 に完全巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_returns_none_for_bare_backslash_at_eof() {
    // b"(\\" の \\ 直後 EOF で次反復が本体で EOF を検出して None・pos == 0 に巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(\\");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_returns_none_for_line_continuation_then_eof() {
    // b"(a\\\n" で行継続後すぐ EOF となり None・pos == 0 に巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(a\\\n");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_returns_none_for_line_continuation_crlf_then_eof() {
    // b"(a\\\r\n" で CRLF 行継続後すぐ EOF となり None・pos == 0 に巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(a\\\r\n");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_returns_none_for_unknown_escape_then_eof() {
    // b"(\\x" で未知エスケープ後すぐ EOF となり None・pos == 0 に巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"(\\x");
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_literal_string_failure_at_mid_buffer_rolls_back_to_call_site() {
    // b"xabc" で advance 後 pos == 1 から呼び None・pos == 1 に完全巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"xabc");
    let _ = lexer.advance();
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_literal_string_unterminated_at_mid_buffer_rolls_back_to_call_site() {
    // b"x(abc" で advance 後 pos == 1 から呼び未終端で None・pos == 1 に完全巻き戻しすることを確認する
    let mut lexer = Lexer::new(b"x(abc");
    let _ = lexer.advance();
    assert_eq!(lexer.read_literal_string(), None);
    assert_eq!(lexer.position(), 1);
}
