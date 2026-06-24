use super::super::token::{Primitive, Token};
use super::super::Lexer;

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
