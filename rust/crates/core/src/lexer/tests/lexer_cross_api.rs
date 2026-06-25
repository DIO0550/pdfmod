use super::super::Lexer;

// ---------- Phase 7: 横断（panic 不在 / 不変条件 / 結合） ----------

#[test]
fn all_apis_do_not_panic_at_eof() {
    // EOF 状態で全 API を順に呼んでも panic せず pos が input.len() を維持することを確認する
    let mut lexer = Lexer::new(b"ab");
    lexer.advance();
    lexer.advance();
    let len = 2;
    let _ = lexer.peek();
    let _ = lexer.peek_at(0);
    let _ = lexer.peek_at(usize::MAX);
    let _ = lexer.advance();
    lexer.skip_whitespace();
    let _ = lexer.skip_comment();
    lexer.skip_whitespace_and_comments();
    let _ = lexer.read_integer();
    let _ = lexer.read_real();
    let _ = lexer.read_name();
    let _ = lexer.read_literal_string();
    let _ = lexer.read_hex_string();
    let _ = lexer.read_array_begin();
    let _ = lexer.read_array_end();
    let _ = lexer.read_dict_begin();
    let _ = lexer.read_dict_end();
    let _ = lexer.read_keyword();
    let _ = lexer.next_token();
    assert_eq!(lexer.position(), len);
    assert!(lexer.is_eof());
}

#[test]
fn all_apis_do_not_panic_for_empty_input() {
    // 空入力で全 API を順に呼んでも panic せず pos が 0 を維持することを確認する
    let mut lexer = Lexer::new(&[]);
    let _ = lexer.peek();
    let _ = lexer.peek_at(0);
    let _ = lexer.peek_at(usize::MAX);
    let _ = lexer.advance();
    lexer.skip_whitespace();
    let _ = lexer.skip_comment();
    lexer.skip_whitespace_and_comments();
    let _ = lexer.read_integer();
    let _ = lexer.read_real();
    let _ = lexer.read_name();
    let _ = lexer.read_literal_string();
    let _ = lexer.read_hex_string();
    let _ = lexer.read_array_begin();
    let _ = lexer.read_array_end();
    let _ = lexer.read_dict_begin();
    let _ = lexer.read_dict_end();
    let _ = lexer.read_keyword();
    let _ = lexer.next_token();
    assert_eq!(lexer.position(), 0);
}

#[test]
fn position_never_exceeds_input_len_after_skip() {
    // 各種入力で skip 系と read 系を呼んだ後 position が input.len() を超えないことを確認する
    let inputs: &[&[u8]] = &[b"", b" ", b"%c\n", b" %a\n %b\n"];
    for input in inputs {
        let mut lexer = Lexer::new(input);
        lexer.skip_whitespace();
        assert!(lexer.position() <= input.len());
        let _ = lexer.skip_comment();
        assert!(lexer.position() <= input.len());
        lexer.skip_whitespace_and_comments();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_array_begin();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_array_end();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_dict_begin();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_dict_end();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_keyword();
        assert!(lexer.position() <= input.len());
        let _ = lexer.next_token();
        assert!(lexer.position() <= input.len());
    }
}

#[test]
fn skip_comment_after_skip_whitespace_processes_pdf_header_then_body() {
    // PDF ヘッダ風の結合入力で合成 API 1 回呼び出し後に peek が本文先頭 'b' を指すことを確認する
    let mut lexer = Lexer::new(b"\n%PDF-1.7\nbody");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'b'));
}
