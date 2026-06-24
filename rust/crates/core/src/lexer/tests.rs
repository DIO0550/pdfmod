use super::*;

mod lexer_advance;
mod lexer_cross_api;
mod lexer_is_eof;
mod lexer_new_position;
mod lexer_peek;
mod lexer_read_array_dict;
mod lexer_read_integer;
mod lexer_read_integer_then_read_real;
mod lexer_read_name;
mod lexer_read_real_basic;
mod lexer_read_real_edge;
mod lexer_skip_comment;
mod lexer_skip_whitespace;
mod lexer_skip_ws_and_comments;

// ---------- Phase C: read_keyword の Primitive マッピング ----------

#[test]
fn read_keyword_maps_true_to_primitive_boolean_true() {
    // `true` 単独入力で Some(Primitive(Boolean(true))) を返し pos == 4 になることを確認する
    let mut lexer = Lexer::new(b"true");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(true)))
    );
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_maps_false_to_primitive_boolean_false() {
    // `false` 単独入力で Some(Primitive(Boolean(false))) を返し pos == 5 になることを確認する
    let mut lexer = Lexer::new(b"false");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(false)))
    );
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_keyword_distinguishes_true_and_false() {
    // true と false のマッピング結果が同じ Primitive::Boolean 内でも非等価であることを確認する
    let mut lexer_t = Lexer::new(b"true");
    let mut lexer_f = Lexer::new(b"false");
    assert_ne!(lexer_t.read_keyword(), lexer_f.read_keyword());
}

#[test]
fn read_keyword_maps_true_followed_by_whitespace() {
    // `true ` のように whitespace が続いても pos == 4 で停止し Boolean(true) を返すことを確認する
    let mut lexer = Lexer::new(b"true ");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(true)))
    );
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_maps_false_followed_by_delimiter() {
    // `false]` のように delimiter が続いても pos == 5 で停止し Boolean(false) を返すことを確認する
    let mut lexer = Lexer::new(b"false]");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(false)))
    );
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_keyword_maps_null_followed_by_eof() {
    // `null` で入力終端の場合 Some(Primitive(Null)) / pos == 4 / is_eof を確認する
    let mut lexer = Lexer::new(b"null");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Null))
    );
    assert_eq!(lexer.position(), 4);
    assert!(lexer.is_eof());
}

#[test]
fn read_keyword_maps_null_followed_by_slash() {
    // `null/Type` のように / delimiter が続いても pos == 4 で停止し Null を返すことを確認する
    let mut lexer = Lexer::new(b"null/Type");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Null))
    );
    assert_eq!(lexer.position(), 4);
}

// ---------- Phase D: read_keyword の構造制御マッピング ----------

#[test]
fn read_keyword_maps_stream_to_stream_begin() {
    // `stream` 単独入力で Some(Token::StreamBegin) を返し pos == 6 になることを確認する
    let mut lexer = Lexer::new(b"stream");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamBegin));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_keyword_maps_endstream_to_stream_end() {
    // `endstream` 単独入力で Some(Token::StreamEnd) を返し pos == 9 になることを確認する
    let mut lexer = Lexer::new(b"endstream");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamEnd));
    assert_eq!(lexer.position(), 9);
}

#[test]
fn read_keyword_distinguishes_obj_and_endobj() {
    // obj と endobj の桁違いマッピングが別バリアント（ObjBegin ≠ ObjEnd）であることを確認する
    let mut lexer_obj = Lexer::new(b"obj");
    let mut lexer_endobj = Lexer::new(b"endobj");
    assert_ne!(lexer_obj.read_keyword(), lexer_endobj.read_keyword());
}

#[test]
fn read_keyword_distinguishes_stream_and_endstream() {
    // stream と endstream の桁違いマッピングが別バリアント（StreamBegin ≠ StreamEnd）であることを確認する
    let mut lexer_s = Lexer::new(b"stream");
    let mut lexer_es = Lexer::new(b"endstream");
    assert_ne!(lexer_s.read_keyword(), lexer_es.read_keyword());
}

#[test]
fn read_keyword_maps_obj_followed_by_whitespace() {
    // `obj\n` のように LF が続いても pos == 3 で停止し ObjBegin を返すことを確認する
    let mut lexer = Lexer::new(b"obj\n");
    assert_eq!(lexer.read_keyword(), Some(Token::ObjBegin));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_keyword_maps_endobj_followed_by_eof() {
    // `endobj` で入力終端の場合 Some(ObjEnd) / pos == 6 / is_eof を確認する
    let mut lexer = Lexer::new(b"endobj");
    assert_eq!(lexer.read_keyword(), Some(Token::ObjEnd));
    assert_eq!(lexer.position(), 6);
    assert!(lexer.is_eof());
}

#[test]
fn read_keyword_maps_stream_followed_by_lf() {
    // `stream\n` のように LF が続いても pos == 6 で停止し StreamBegin を返すことを確認する（stream データ本体は本層スコープ外）
    let mut lexer = Lexer::new(b"stream\n");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamBegin));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_keyword_maps_endstream_followed_by_endobj() {
    // `endstream\nendobj` の最初の呼び出しで Some(StreamEnd) / pos == 9 を確認する
    let mut lexer = Lexer::new(b"endstream\nendobj");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamEnd));
    assert_eq!(lexer.position(), 9);
}

// ---------- Phase E: read_keyword の未知キーワード平坦化 ----------

#[test]
fn read_keyword_flattens_uppercase_true_to_keyword() {
    // 大文字始まり `True` は case-sensitive により Boolean ではなく Keyword(b"True") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"True");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"True".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_flattens_uppercase_false_to_keyword() {
    // 全大文字 `FALSE` は case-sensitive により Boolean ではなく Keyword(b"FALSE") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"FALSE");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"FALSE".to_vec()))
    );
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_keyword_flattens_uppercase_null_to_keyword() {
    // 大文字始まり `Null` は case-sensitive により Null ではなく Keyword(b"Null") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"Null");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"Null".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_flattens_uppercase_obj_to_keyword() {
    // 全大文字 `OBJ` は case-sensitive により ObjBegin ではなく Keyword(b"OBJ") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"OBJ");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"OBJ".to_vec())));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_keyword_flattens_uppercase_stream_to_keyword() {
    // 大文字始まり `Stream` は case-sensitive により StreamBegin ではなく Keyword(b"Stream") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"Stream");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"Stream".to_vec()))
    );
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_keyword_flattens_indirect_ref_marker_r() {
    // `R` 単独は間接参照マーカだが Lexer 層では Keyword(b"R") へ平坦化されることを確認する（組み立ては parser の責務）
    let mut lexer = Lexer::new(b"R");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"R".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_flattens_xref_keyword() {
    // `xref` キーワードが Keyword(b"xref") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"xref");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"xref".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_flattens_trailer_keyword() {
    // `trailer` キーワードが Keyword(b"trailer") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"trailer");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"trailer".to_vec()))
    );
    assert_eq!(lexer.position(), 7);
}

#[test]
fn read_keyword_flattens_startxref_keyword() {
    // `startxref` キーワードが Keyword(b"startxref") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"startxref");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"startxref".to_vec()))
    );
    assert_eq!(lexer.position(), 9);
}

#[test]
fn read_keyword_flattens_xref_entry_f_keyword() {
    // xref エントリ末尾 `f` 単独が Keyword(b"f") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"f");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"f".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_flattens_xref_entry_n_keyword() {
    // xref エントリ末尾 `n` 単独が Keyword(b"n") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"n");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"n".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_flattens_true_x_as_single_keyword() {
    // `trueX` のように true キーワードに regular byte が連結された字句は分割せず Keyword(b"trueX") として吸収されることを確認する
    let mut lexer = Lexer::new(b"trueX");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"trueX".to_vec()))
    );
    assert_eq!(lexer.position(), 5);
}

// ---------- Phase F: read_keyword の境界条件 ----------

#[test]
fn read_keyword_returns_none_for_empty_input() {
    // 空入力に対する read_keyword が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_keyword(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_keyword_returns_none_at_eof() {
    // EOF 状態の read_keyword が None を返し pos が EOF 位置のままであることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_keyword(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_returns_none_for_every_leading_whitespace_byte() {
    // ISO 32000 whitespace 6 種を先頭に置くと read_keyword が None / pos 不変であることを総当たりで確認する
    let whitespaces: [u8; 6] = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for ws in whitespaces {
        let input = [ws, b'X'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_keyword(), None, "whitespace byte = {:#x}", ws);
        assert_eq!(lexer.position(), 0, "whitespace byte = {:#x}", ws);
    }
}

#[test]
fn read_keyword_returns_none_for_every_leading_delimiter_byte() {
    // ISO 32000 delimiter 10 種を先頭に置くと read_keyword が None / pos 不変であることを総当たりで確認する
    let delimiters: [u8; 10] = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for delim in delimiters {
        let input = [delim, b'X'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_keyword(), None, "delimiter byte = {:#x}", delim);
        assert_eq!(lexer.position(), 0, "delimiter byte = {:#x}", delim);
    }
}

#[test]
fn read_keyword_stops_at_every_whitespace_byte() {
    // `true<ws>x` の whitespace 6 種総当たりで pos == 4 / Boolean(true) を返すことを確認する
    let whitespaces: [u8; 6] = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for ws in whitespaces {
        let input = [b't', b'r', b'u', b'e', ws, b'x'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_keyword(),
            Some(Token::Primitive(Primitive::Boolean(true))),
            "whitespace byte = {:#x}",
            ws
        );
        assert_eq!(lexer.position(), 4, "whitespace byte = {:#x}", ws);
    }
}

#[test]
fn read_keyword_stops_at_every_delimiter_byte() {
    // `true<delim>x` の delimiter 10 種総当たりで pos == 4 / Boolean(true) を返すことを確認する
    let delimiters: [u8; 10] = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for delim in delimiters {
        let input = [b't', b'r', b'u', b'e', delim, b'x'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_keyword(),
            Some(Token::Primitive(Primitive::Boolean(true))),
            "delimiter byte = {:#x}",
            delim
        );
        assert_eq!(lexer.position(), 4, "delimiter byte = {:#x}", delim);
    }
}

#[test]
fn read_keyword_stops_at_eof() {
    // `obj` で入力終端の場合 Some(ObjBegin) / pos == 3 / is_eof を確認する
    let mut lexer = Lexer::new(b"obj");
    assert_eq!(lexer.read_keyword(), Some(Token::ObjBegin));
    assert_eq!(lexer.position(), 3);
    assert!(lexer.is_eof());
}

#[test]
fn read_keyword_reads_single_regular_byte() {
    // 単一の regular byte `R` が Keyword(b"R") として読み取られることを確認する
    let mut lexer = Lexer::new(b"R");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"R".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_reads_long_unknown_byte_sequence() {
    // 長い未知バイト列 `MyCustomKeyword123` が分割されず 1 Keyword として読み取られることを確認する
    let mut lexer = Lexer::new(b"MyCustomKeyword123");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"MyCustomKeyword123".to_vec()))
    );
    assert_eq!(lexer.position(), 18);
}

#[test]
fn read_keyword_does_not_rewind_on_successful_read() {
    // 成功時に pos が必ず前進する（巻き戻されない）ことを確認する
    let mut lexer = Lexer::new(b"obj");
    let start = lexer.position();
    let _ = lexer.read_keyword();
    assert!(lexer.position() > start);
}

#[test]
fn read_keyword_keeps_position_zero_on_leading_whitespace() {
    // 先頭が whitespace の入力 ` true` では None / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b" true");
    assert_eq!(lexer.read_keyword(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_keyword_preserves_non_ascii_bytes_in_keyword() {
    // 非 ASCII バイト 0xC3 0xA9 を含む regular 列が Keyword(<原文 bytes>) として忠実に保持されることを確認する
    let input: &[u8] = &[b'a', 0xC3, 0xA9, b'z'];
    let mut lexer = Lexer::new(input);
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(vec![b'a', 0xC3, 0xA9, b'z']))
    );
    assert_eq!(lexer.position(), 4);
}

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
