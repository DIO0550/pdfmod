use super::super::token::Token;
use super::super::Lexer;

// ---------- Phase A: read_array_begin / read_array_end ----------

#[test]
fn read_array_begin_returns_none_for_empty_input() {
    // 空入力に対する read_array_begin が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_array_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_begin_returns_none_for_non_bracket_byte() {
    // 先頭バイトが `[` でない `(` を入力すると None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"(abc");
    assert_eq!(lexer.read_array_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_begin_returns_none_at_eof() {
    // EOF 状態の read_array_begin が None を返し pos が EOF 位置のままであることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_array_begin(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_begin_reads_bracket() {
    // `[` 単独入力で Some(Token::ArrayBegin) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"[");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_begin_reads_bracket_followed_by_digit() {
    // `[123` のように regular byte が直接続いても pos == 1 で停止することを確認する
    let mut lexer = Lexer::new(b"[123");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_begin_reads_bracket_followed_by_whitespace() {
    // `[ ` のように whitespace が続いても pos == 1 で停止することを確認する
    let mut lexer = Lexer::new(b"[ ");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_end_returns_none_for_empty_input() {
    // 空入力に対する read_array_end が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_array_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_end_returns_none_for_non_bracket_byte() {
    // 先頭バイトが `]` でない `}` を入力すると None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"}abc");
    assert_eq!(lexer.read_array_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_end_reads_close_bracket_followed_by_eof() {
    // `]` 1 バイトのみで入力終端の場合、Some(ArrayEnd) / pos == 1 / is_eof を確認する
    let mut lexer = Lexer::new(b"]");
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
    assert!(lexer.is_eof());
}

#[test]
fn read_array_end_reads_close_bracket_followed_by_delimiter() {
    // `]>>` のように別 delimiter が続いても pos == 1 で停止することを確認する
    let mut lexer = Lexer::new(b"]>>");
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_apis_handle_nested_pattern_with_position_advance() {
    // `[[]]` を 4 回呼び出すと ArrayBegin / ArrayBegin / ArrayEnd / ArrayEnd が順に返り pos == 4 になることを確認する
    let mut lexer = Lexer::new(b"[[]]");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 4);
}

// ---------- Phase B: read_dict_begin / read_dict_end ----------

#[test]
fn read_dict_begin_returns_none_for_empty_input() {
    // 空入力に対する read_dict_begin が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_single_less_than() {
    // `<` 単独で次バイトが無い場合に None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"<");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_less_than_plus_hex_digit() {
    // `<a` のように 16 進開始を示す入力では None / pos 不変であることを確認する（read_hex_string の責務範囲）
    let mut lexer = Lexer::new(b"<a");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_less_than_plus_gt() {
    // `<>` （空 16 進文字列）でも `<<` 不一致のため None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"<>");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_less_than_at_eof() {
    // `<` 1 バイトのみで EOF の場合に None / pos 不変 / is_eof は false（pos == 0 で input.len() == 1 のため）であることを確認する
    let mut lexer = Lexer::new(b"<");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
    assert!(!lexer.is_eof());
}

#[test]
fn read_dict_begin_reads_double_less_than_followed_by_name() {
    // `<</Type` のように 名前が続いても pos == 2 で停止することを確認する
    let mut lexer = Lexer::new(b"<</Type");
    assert_eq!(lexer.read_dict_begin(), Some(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_dict_begin_reads_double_less_than_followed_by_eof() {
    // `<<` 2 バイトのみで EOF の場合 Some(DictBegin) / pos == 2 / is_eof を確認する
    let mut lexer = Lexer::new(b"<<");
    assert_eq!(lexer.read_dict_begin(), Some(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
    assert!(lexer.is_eof());
}

#[test]
fn read_dict_end_returns_none_for_empty_input() {
    // 空入力に対する read_dict_end が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_end_returns_none_for_single_greater_than() {
    // `>` 単独で次バイトが無い場合に None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_end_returns_none_for_greater_than_plus_other() {
    // `>x` のように 2 バイト目が `>` でない場合に None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b">x");
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_end_returns_none_for_greater_than_at_eof() {
    // `>` 1 バイトのみで EOF の場合に None / pos 不変 / is_eof は false（pos == 0 で input.len() == 1 のため）であることを確認する
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
    assert!(!lexer.is_eof());
}

#[test]
fn read_dict_end_reads_double_greater_than_followed_by_whitespace() {
    // `>>\n` のように whitespace が続いても pos == 2 で停止することを確認する
    let mut lexer = Lexer::new(b">>\n");
    assert_eq!(lexer.read_dict_end(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_dict_end_reads_double_greater_than_followed_by_eof() {
    // `>>` 2 バイトのみで EOF の場合 Some(DictEnd) / pos == 2 / is_eof を確認する
    let mut lexer = Lexer::new(b">>");
    assert_eq!(lexer.read_dict_end(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
    assert!(lexer.is_eof());
}

#[test]
fn read_dict_apis_handle_empty_dict_pattern() {
    // `<<>>` を 2 回呼び出すと DictBegin / DictEnd が順に返り pos == 4 になることを確認する
    let mut lexer = Lexer::new(b"<<>>");
    assert_eq!(lexer.read_dict_begin(), Some(Token::DictBegin));
    assert_eq!(lexer.read_dict_end(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 4);
}
