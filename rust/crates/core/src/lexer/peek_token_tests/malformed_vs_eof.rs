use super::lexer;

#[test]
fn peek_token_returns_none_and_is_not_eof_for_lonely_dict_end_marker() {
    // 単独の `>` は malformed (lexer error) として peek_token() が None かつ is_eof()==false
    let mut lex = lexer(b">");
    assert_eq!(lex.peek_token(), None);
    assert!(!lex.is_eof());
}

#[test]
fn peek_token_returns_none_and_is_eof_for_empty_input() {
    // 空入力では peek_token() が None かつ is_eof()==true
    let mut lex = lexer(b"");
    assert_eq!(lex.peek_token(), None);
    assert!(lex.is_eof());
}

#[test]
fn peek_token_returns_none_and_is_not_eof_for_lonely_left_brace() {
    // 単独の `{` も malformed として peek_token() が None かつ is_eof()==false
    let mut lex = lexer(b"{");
    assert_eq!(lex.peek_token(), None);
    assert!(!lex.is_eof());
}
