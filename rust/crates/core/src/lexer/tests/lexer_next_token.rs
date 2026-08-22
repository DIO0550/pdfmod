use super::super::outcome::LexOutcome;
use super::super::token::{Primitive, Token};
use super::super::Lexer;
use crate::object::name::PdfName;

// ---------- Phase G: next_token の合流 ----------

#[test]
fn next_token_returns_eof_for_empty_input() {
    // 空入力に対する next_token が Eof を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.next_token(), LexOutcome::Eof);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_eof_at_end_of_input() {
    // EOF 状態の next_token が Eof を返すことを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.next_token(), LexOutcome::Eof);
}

#[test]
fn next_token_returns_eof_for_only_whitespace() {
    // whitespace のみの入力 `   ` は skip_whitespace で pos が進むが、
    // トークンは無いため Malformed ではなく Eof を返すことを確認する
    let mut lexer = Lexer::new(b"   ");
    assert_eq!(lexer.next_token(), LexOutcome::Eof);
    assert_eq!(lexer.position(), 3);
}

#[test]
fn next_token_dispatches_to_array_begin() {
    // `[` 入力で next_token が Some(ArrayBegin) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"[");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_dispatches_to_array_end() {
    // `]` 入力で next_token が Some(ArrayEnd) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"]");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_dispatches_to_dict_begin_on_double_less_than() {
    // `<<` 入力で next_token が Some(DictBegin) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b"<<");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_falls_back_to_hex_string_on_single_less_than() {
    // `<48656C6C6F>` のような 16 進文字列で next_token が Primitive(HexString(b"Hello")) を返すことを確認する
    let mut lexer = Lexer::new(b"<48656C6C6F>");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::HexString(b"Hello".to_vec())))
    );
    assert_eq!(lexer.position(), 12);
}

#[test]
fn next_token_falls_back_to_hex_string_on_empty_hex_string() {
    // 空 16 進文字列 `<>` で next_token が Primitive(HexString(b"")) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b"<>");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::HexString(b"".to_vec())))
    );
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_dispatches_to_dict_end_on_double_greater_than() {
    // `>>` 入力で next_token が Some(DictEnd) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b">>");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_dispatches_to_literal_string() {
    // `(hello)` 入力で next_token が Primitive(LiteralString(b"hello")) を返すことを確認する
    let mut lexer = Lexer::new(b"(hello)");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::LiteralString(
            b"hello".to_vec()
        )))
    );
}

#[test]
fn next_token_dispatches_to_name() {
    // `/Type` 入力で next_token が Primitive(Name(b"Type")) を返すことを確認する
    let mut lexer = Lexer::new(b"/Type");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Name(PdfName::new(
            b"Type".to_vec()
        ))))
    );
}

#[test]
fn next_token_dispatches_to_integer_on_digit() {
    // `123` 入力で next_token が Primitive(Integer(123)) を返すことを確認する
    let mut lexer = Lexer::new(b"123");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Integer(123)))
    );
}

#[test]
fn next_token_dispatches_to_real_on_dot() {
    // `.5` 入力で next_token が Primitive(Real(0.5)) を返すことを確認する（小数部 1 桁のため f64 累積誤差なし）
    let mut lexer = Lexer::new(b".5");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Real(0.5)))
    );
}

#[test]
fn next_token_falls_back_to_keyword_on_lone_dot() {
    // `.` 単独入力で next_token が read_real 失敗 → read_keyword フォールバックで Keyword(b".") を返すことを確認する（+/- / digit との対称性）
    let mut lexer = Lexer::new(b".");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Keyword(b".".to_vec()))
    );
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_falls_back_to_keyword_on_dot_followed_by_alpha() {
    // `.foo` 入力で next_token が read_real 失敗 → read_keyword フォールバックで Keyword(b".foo") を返すことを確認する
    let mut lexer = Lexer::new(b".foo");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Keyword(b".foo".to_vec()))
    );
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_dispatches_to_real_on_digit_with_dot() {
    // `1.5` 入力で digit 分岐が read_integer 失敗 → read_real 成功で Primitive(Real(1.5)) を返し pos == 3 になることを確認する
    let mut lexer = Lexer::new(b"1.5");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Primitive(Primitive::Real(1.5)))
    );
    assert_eq!(lexer.position(), 3);
}

#[test]
fn next_token_falls_back_to_keyword_on_digit_with_non_numeric_suffix() {
    // `123abc` 入力で digit 分岐が read_integer / read_real 失敗 → read_keyword に到達し Keyword(b"123abc") を返すことを確認する
    let mut lexer = Lexer::new(b"123abc");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Keyword(b"123abc".to_vec()))
    );
    assert_eq!(lexer.position(), 6);
}

#[test]
fn next_token_dispatches_to_keyword_on_plus_letter() {
    // `+ABC` のように read_integer / read_real が失敗する `+` 始まり連結が Keyword(b"+ABC") に吸収されることを確認する
    let mut lexer = Lexer::new(b"+ABC");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Keyword(b"+ABC".to_vec()))
    );
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_dispatches_to_keyword_for_obj() {
    // `obj` 入力で next_token が Some(ObjBegin) を返すことを確認する
    let mut lexer = Lexer::new(b"obj");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ObjBegin));
}

#[test]
fn next_token_returns_comment_token() {
    // `%PDF-1.7\n` 入力で next_token が Comment(b"PDF-1.7") を返し pos == 9（改行直後）になることを確認する
    let mut lexer = Lexer::new(b"%PDF-1.7\n");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Comment(b"PDF-1.7".to_vec()))
    );
    assert_eq!(lexer.position(), 9);
}

#[test]
fn next_token_returns_comment_for_double_percent() {
    // `%%EOF` 入力で next_token が Comment(b"%EOF") を返す（2 個目の `%` は本文の一部）ことを確認する
    let mut lexer = Lexer::new(b"%%EOF");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Comment(b"%EOF".to_vec()))
    );
}

#[test]
fn next_token_skips_leading_whitespace_then_dispatches() {
    // ` \n\t[1` 入力で先頭の whitespace 3 バイトを消費し `[` から Some(ArrayBegin) / pos == 4 を確認する
    let mut lexer = Lexer::new(b" \n\t[1");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayBegin));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_sequence_for_empty_array_and_dict() {
    // `<<[]>>` を 4 回呼び出すと DictBegin / ArrayBegin / ArrayEnd / DictEnd の順に返り 5 回目で Eof になることを確認する
    let mut lexer = Lexer::new(b"<<[]>>");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::DictBegin));
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayBegin));
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayEnd));
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::DictEnd));
    assert_eq!(lexer.next_token(), LexOutcome::Eof);
}

#[test]
fn next_token_returns_malformed_without_advancing_for_isolated_greater_than() {
    // `>` 単独入力で next_token が Malformed { position: 0 } / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.next_token(), LexOutcome::Malformed { position: 0 });
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_malformed_without_advancing_for_unrecognized_delimiter() {
    // `{` のような仕様外 delimiter で next_token が Malformed { position: 0 } / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b"{");
    assert_eq!(lexer.next_token(), LexOutcome::Malformed { position: 0 });
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_malformed_without_advancing_for_less_than_then_whitespace() {
    // `< ` のように `<<` でも 16 進開始でもない `<` パターンで next_token が
    // Malformed { position: 0 } / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b"< ");
    assert_eq!(lexer.next_token(), LexOutcome::Malformed { position: 0 });
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_comment_then_dispatches_next_call() {
    // `% c\n[1]` を 2 回呼ぶと 1 回目 Comment(b" c") / 2 回目 ArrayBegin が返ることを確認する
    let mut lexer = Lexer::new(b"% c\n[1]");
    assert_eq!(
        lexer.next_token(),
        LexOutcome::Lexed(Token::Comment(b" c".to_vec()))
    );
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayBegin));
}

#[test]
fn next_token_returns_malformed_at_the_offending_byte_after_a_valid_token() {
    // `[ >` のように途中から壊れる入力で、malformed が運ぶ position が不正バイトの位置になることを確認する
    let mut lexer = Lexer::new(b"[ >");
    assert_eq!(lexer.next_token(), LexOutcome::Lexed(Token::ArrayBegin));
    assert_eq!(lexer.next_token(), LexOutcome::Malformed { position: 2 });
}

#[test]
fn next_token_reports_the_same_position_when_malformed_is_retried() {
    // 同じ malformed 入力で再試行しても position が進まないこと（no-progress 検知が成立すること）を確認する
    let mut lexer = Lexer::new(b">");
    let first = lexer.next_token();
    let second = lexer.next_token();

    assert_eq!(first, LexOutcome::Malformed { position: 0 });
    assert_eq!(second, LexOutcome::Malformed { position: 0 });
}
