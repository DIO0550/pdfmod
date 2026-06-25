use super::super::token::{Primitive, Token};
use super::super::Lexer;
use crate::object::name::PdfName;

// ---------- Phase G: next_token の合流 ----------

#[test]
fn next_token_returns_none_for_empty_input() {
    // 空入力に対する next_token が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_none_at_eof() {
    // EOF 状態の next_token が None を返すことを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.next_token(), None);
}

#[test]
fn next_token_returns_none_for_only_whitespace() {
    // whitespace のみの入力 `   ` で next_token が None を返し pos == 入力長まで進むことを確認する
    let mut lexer = Lexer::new(b"   ");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 3);
}

#[test]
fn next_token_dispatches_to_array_begin() {
    // `[` 入力で next_token が Some(ArrayBegin) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"[");
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_dispatches_to_array_end() {
    // `]` 入力で next_token が Some(ArrayEnd) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"]");
    assert_eq!(lexer.next_token(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_dispatches_to_dict_begin_on_double_less_than() {
    // `<<` 入力で next_token が Some(DictBegin) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b"<<");
    assert_eq!(lexer.next_token(), Some(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_falls_back_to_hex_string_on_single_less_than() {
    // `<48656C6C6F>` のような 16 進文字列で next_token が Primitive(HexString(b"Hello")) を返すことを確認する
    let mut lexer = Lexer::new(b"<48656C6C6F>");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::HexString(b"Hello".to_vec())))
    );
    assert_eq!(lexer.position(), 12);
}

#[test]
fn next_token_falls_back_to_hex_string_on_empty_hex_string() {
    // 空 16 進文字列 `<>` で next_token が Primitive(HexString(b"")) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b"<>");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::HexString(b"".to_vec())))
    );
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_dispatches_to_dict_end_on_double_greater_than() {
    // `>>` 入力で next_token が Some(DictEnd) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b">>");
    assert_eq!(lexer.next_token(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_dispatches_to_literal_string() {
    // `(hello)` 入力で next_token が Primitive(LiteralString(b"hello")) を返すことを確認する
    let mut lexer = Lexer::new(b"(hello)");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::LiteralString(
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
        Some(Token::Primitive(Primitive::Name(PdfName::new(
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
        Some(Token::Primitive(Primitive::Integer(123)))
    );
}

#[test]
fn next_token_dispatches_to_real_on_dot() {
    // `.5` 入力で next_token が Primitive(Real(0.5)) を返すことを確認する（小数部 1 桁のため f64 累積誤差なし）
    let mut lexer = Lexer::new(b".5");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::Real(0.5)))
    );
}

#[test]
fn next_token_falls_back_to_keyword_on_lone_dot() {
    // `.` 単独入力で next_token が read_real 失敗 → read_keyword フォールバックで Keyword(b".") を返すことを確認する（+/- / digit との対称性）
    let mut lexer = Lexer::new(b".");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b".".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_falls_back_to_keyword_on_dot_followed_by_alpha() {
    // `.foo` 入力で next_token が read_real 失敗 → read_keyword フォールバックで Keyword(b".foo") を返すことを確認する
    let mut lexer = Lexer::new(b".foo");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b".foo".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_dispatches_to_real_on_digit_with_dot() {
    // `1.5` 入力で digit 分岐が read_integer 失敗 → read_real 成功で Primitive(Real(1.5)) を返し pos == 3 になることを確認する
    let mut lexer = Lexer::new(b"1.5");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::Real(1.5)))
    );
    assert_eq!(lexer.position(), 3);
}

#[test]
fn next_token_falls_back_to_keyword_on_digit_with_non_numeric_suffix() {
    // `123abc` 入力で digit 分岐が read_integer / read_real 失敗 → read_keyword に到達し Keyword(b"123abc") を返すことを確認する
    let mut lexer = Lexer::new(b"123abc");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b"123abc".to_vec())));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn next_token_dispatches_to_keyword_on_plus_letter() {
    // `+ABC` のように read_integer / read_real が失敗する `+` 始まり連結が Keyword(b"+ABC") に吸収されることを確認する
    let mut lexer = Lexer::new(b"+ABC");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b"+ABC".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_dispatches_to_keyword_for_obj() {
    // `obj` 入力で next_token が Some(ObjBegin) を返すことを確認する
    let mut lexer = Lexer::new(b"obj");
    assert_eq!(lexer.next_token(), Some(Token::ObjBegin));
}

#[test]
fn next_token_returns_comment_token() {
    // `%PDF-1.7\n` 入力で next_token が Comment(b"PDF-1.7") を返し pos == 9（改行直後）になることを確認する
    let mut lexer = Lexer::new(b"%PDF-1.7\n");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Comment(b"PDF-1.7".to_vec()))
    );
    assert_eq!(lexer.position(), 9);
}

#[test]
fn next_token_returns_comment_for_double_percent() {
    // `%%EOF` 入力で next_token が Comment(b"%EOF") を返す（2 個目の `%` は本文の一部）ことを確認する
    let mut lexer = Lexer::new(b"%%EOF");
    assert_eq!(lexer.next_token(), Some(Token::Comment(b"%EOF".to_vec())));
}

#[test]
fn next_token_skips_leading_whitespace_then_dispatches() {
    // ` \n\t[1` 入力で先頭の whitespace 3 バイトを消費し `[` から Some(ArrayBegin) / pos == 4 を確認する
    let mut lexer = Lexer::new(b" \n\t[1");
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_sequence_for_empty_array_and_dict() {
    // `<<[]>>` を 4 回呼び出すと DictBegin / ArrayBegin / ArrayEnd / DictEnd の順に返り 5 回目で None になることを確認する
    let mut lexer = Lexer::new(b"<<[]>>");
    assert_eq!(lexer.next_token(), Some(Token::DictBegin));
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
    assert_eq!(lexer.next_token(), Some(Token::ArrayEnd));
    assert_eq!(lexer.next_token(), Some(Token::DictEnd));
    assert_eq!(lexer.next_token(), None);
}

#[test]
fn next_token_returns_none_without_advancing_for_isolated_greater_than() {
    // `>` 単独入力で next_token が None / pos == 0 を維持することを確認する（malformed 検知は parser 側に委譲）
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_none_without_advancing_for_unrecognized_delimiter() {
    // `{` のような仕様外 delimiter で next_token が None / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b"{");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_none_without_advancing_for_less_than_then_whitespace() {
    // `< ` のように `<<` でも 16 進開始でもない `<` パターンで next_token が None / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b"< ");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_comment_then_dispatches_next_call() {
    // `% c\n[1]` を 2 回呼ぶと 1 回目 Comment(b" c") / 2 回目 ArrayBegin が返ることを確認する
    let mut lexer = Lexer::new(b"% c\n[1]");
    assert_eq!(lexer.next_token(), Some(Token::Comment(b" c".to_vec())));
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
}
