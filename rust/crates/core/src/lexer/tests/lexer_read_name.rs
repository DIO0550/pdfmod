use super::super::Lexer;
use crate::object::name::PdfName;

// ---------- Phase 10: read_name ----------

// Phase 10-A: 早期 None（先頭バイトが '/' でない / EOF / 空）

#[test]
fn read_name_returns_none_for_empty_input() {
    // 空入力で read_name が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_returns_none_at_eof() {
    // EOF 状態の read_name が None を返し pos 不変であることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_name_returns_none_for_non_slash_leading_byte() {
    // 先頭が '/' でない 'abc' で None を返し pos 0 のままであることを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_returns_none_for_every_leading_whitespace_byte() {
    // 仕様 §2.1 の whitespace 6 バイトを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [w, b'T', b'y', b'p', b'e'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            None,
            "whitespace 0x{w:02X} should yield None"
        );
        assert_eq!(
            lexer.position(),
            0,
            "whitespace 0x{w:02X} should keep pos 0"
        );
    }
}

#[test]
fn read_name_returns_none_for_every_leading_delimiter_byte() {
    // 仕様 §2.2 の delimiter のうち '/' 以外 9 バイトを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
    // ('/' は 10-F で空名前として別途検証)
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x25];
    for d in delimiter_bytes {
        let input = [d, b'T', b'y', b'p', b'e'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            None,
            "delimiter 0x{d:02X} should yield None"
        );
        assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
    }
}

// Phase 10-B: 基本 ASCII 名前

#[test]
fn read_name_reads_simple_ascii_name() {
    // '/Type' (EOF 終端) で Some(b"Type")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/Type");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_reads_subtype_name() {
    // 桁数の三角測量: '/Subtype' で Some(b"Subtype")・pos == 8 を確認する
    let mut lexer = Lexer::new(b"/Subtype");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Subtype".to_vec())));
    assert_eq!(lexer.position(), 8);
}

#[test]
fn read_name_reads_single_letter_name() {
    // 三角測量: '/A' 単一文字で Some(b"A")・pos == 2 を確認する
    let mut lexer = Lexer::new(b"/A");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A".to_vec())));
    assert_eq!(lexer.position(), 2);
}

// Phase 10-C: #XX エスケープ単発

#[test]
fn read_name_decodes_uppercase_hex_escape() {
    // '/A#42' (#42='B') で Some(b"AB")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/A#42");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"AB".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_decodes_lowercase_hex_escape() {
    // '/a#ff' (#ff=0xFF) で Some(b"a\xFF")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/a#ff");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"a\xFF".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_decodes_mixed_case_hex_escape() {
    // '/a#fF' 大小混在で Some(b"a\xFF")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/a#fF");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"a\xFF".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_decodes_whitespace_byte_via_escape() {
    // '/Hello#20World' (#20=space) で Some(b"Hello World")・pos == 14 を確認する（境界判定は生バイトのみ）
    let mut lexer = Lexer::new(b"/Hello#20World");
    assert_eq!(
        lexer.read_name(),
        Some(PdfName::new(b"Hello World".to_vec()))
    );
    assert_eq!(lexer.position(), 14);
}

#[test]
fn read_name_decodes_delimiter_byte_via_escape() {
    // '/A#28B' (#28='(') で Some(b"A(B")・pos == 6 を確認する
    let mut lexer = Lexer::new(b"/A#28B");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A(B".to_vec())));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_name_treats_nul_escape_as_literal_hash() {
    // '/A#00B' で Some(b"A#00B")・pos == 6 を確認する。
    // ISO 32000-2 §7.3.5 は名前中の NUL を禁止するため #00 はエスケープとして不正
    let mut lexer = Lexer::new(b"/A#00B");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#00B".to_vec())));
    assert_eq!(lexer.position(), 6);
}

// Phase 10-D: #XX エスケープ複数

#[test]
fn read_name_decodes_consecutive_escapes() {
    // '/paired#28#29parentheses' で連続エスケープを復号し Some(b"paired()parentheses")・pos == 24 を確認する
    let mut lexer = Lexer::new(b"/paired#28#29parentheses");
    assert_eq!(
        lexer.read_name(),
        Some(PdfName::new(b"paired()parentheses".to_vec()))
    );
    assert_eq!(lexer.position(), 24);
}

#[test]
fn read_name_decodes_escape_then_regular_then_escape() {
    // '/A#42C#43' (#42='B', #43='C') で Some(b"ABCC")・pos == 9 を確認する
    let mut lexer = Lexer::new(b"/A#42C#43");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"ABCC".to_vec())));
    assert_eq!(lexer.position(), 9);
}

// Phase 10-E: 終端境界

#[test]
fn read_name_stops_at_every_trailing_whitespace_byte() {
    // '/Type' + whitespace 6 種の全組で Some(b"Type")・pos == 5 で停止することを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [b'/', b'T', b'y', b'p', b'e', w];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            Some(PdfName::new(b"Type".to_vec())),
            "whitespace 0x{w:02X} should yield Some(b\"Type\")"
        );
        assert_eq!(lexer.position(), 5, "whitespace 0x{w:02X} should stop at 5");
    }
}

#[test]
fn read_name_stops_at_every_trailing_delimiter_byte() {
    // '/Type' + delimiter 10 種の全組で Some(b"Type")・pos == 5 で停止することを確認する
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for d in delimiter_bytes {
        let input = [b'/', b'T', b'y', b'p', b'e', d];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            Some(PdfName::new(b"Type".to_vec())),
            "delimiter 0x{d:02X} should yield Some(b\"Type\")"
        );
        assert_eq!(lexer.position(), 5, "delimiter 0x{d:02X} should stop at 5");
    }
}

#[test]
fn read_name_stops_at_eof() {
    // '/Type' (EOF 終端) で Some(b"Type")・pos == 5・is_eof() を確認する
    let mut lexer = Lexer::new(b"/Type");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
    assert_eq!(lexer.position(), 5);
    assert!(lexer.is_eof());
}

// Phase 10-F: 空名前 '/'

#[test]
fn read_name_returns_empty_name_at_eof() {
    // '/' 単独で Some(b"")・pos == 1・is_eof() を確認する（空名前受理）
    let mut lexer = Lexer::new(b"/");
    assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
    assert_eq!(lexer.position(), 1);
    assert!(lexer.is_eof());
}

#[test]
fn read_name_returns_empty_name_before_whitespace() {
    // '/ rest' で Some(b"")・pos == 1 を確認する
    let mut lexer = Lexer::new(b"/ rest");
    assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_name_returns_empty_name_before_delimiter() {
    // '/[' で Some(b"")・pos == 1 を確認する
    let mut lexer = Lexer::new(b"/[");
    assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
    assert_eq!(lexer.position(), 1);
}

// Phase 10-G: 不正 #XX エスケープ（'#' のリテラル扱い）

#[test]
fn read_name_treats_hash_at_eof_as_literal() {
    // '/A#' (# のあと EOF) で Some(b"A#")・pos == 3 を確認する
    let mut lexer = Lexer::new(b"/A#");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#".to_vec())));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_name_treats_hash_with_one_hex_then_eof_as_literal() {
    // '/A#1' (#1 のあと EOF) で Some(b"A#1")・pos == 4 を確認する
    let mut lexer = Lexer::new(b"/A#1");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#1".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_name_treats_hash_with_non_hex_high_as_literal() {
    // '/A#Z' (高位が非16進) で Some(b"A#Z")・pos == 4 を確認する
    let mut lexer = Lexer::new(b"/A#Z");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#Z".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_name_treats_hash_with_non_hex_low_as_literal() {
    // '/A#1Z' (低位が非16進) で Some(b"A#1Z")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/A#1Z");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#1Z".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_treats_hash_with_whitespace_low_as_literal() {
    // '/A#1 ' (低位が space) で Some(b"A#1")・pos == 4 を確認する（space で名前が終わる）
    let mut lexer = Lexer::new(b"/A#1 ");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#1".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_name_treats_hash_with_delimiter_low_as_literal() {
    // '/A#1/' (低位が '/') で Some(b"A#1")・pos == 4 を確認する（delimiter で名前が終わる）
    let mut lexer = Lexer::new(b"/A#1/");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#1".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_name_treats_hash_with_nul_low_as_literal() {
    // '/A#1\0' (低位が生の NUL = token boundary) で Some(b"A#1")・pos == 4 を確認する
    let input = [b'/', b'A', b'#', b'1', 0x00];
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#1".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_name_treats_hash_with_whitespace_high_as_literal() {
    // '/A# ' (高位が space) で Some(b"A#")・pos == 3 を確認する
    let mut lexer = Lexer::new(b"/A# ");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#".to_vec())));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_name_treats_hash_with_delimiter_high_as_literal() {
    // '/A#/' (高位が '/') で Some(b"A#")・pos == 3 を確認する
    let mut lexer = Lexer::new(b"/A#/");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#".to_vec())));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_name_treats_non_hex_high_and_low_as_literal_hash() {
    // '/A#GG' (高位・低位とも非16進) で Some(b"A#GG")・pos == 5 を確認する。
    // Issue #332 の代表入力で、TypeScript 実装と同じ名前になることを保証する
    let mut lexer = Lexer::new(b"/A#GG");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#GG".to_vec())));
    assert_eq!(lexer.position(), 5);
}

// Phase 10-H: 長名前（仕様推奨上限 127 バイトを超えても受理）

#[test]
fn read_name_accepts_200_byte_ascii_name() {
    // '/' + 'A' × 200 で Some([b'A'; 200])・pos == 201 を確認する（推奨上限非強制）
    let mut input = Vec::with_capacity(201);
    input.push(b'/');
    input.extend(std::iter::repeat_n(b'A', 200));
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_name(), Some(PdfName::new([b'A'; 200].to_vec())));
    assert_eq!(lexer.position(), 201);
}

// Phase 10-I: 中間位置呼び出し（advance 後の起点）

#[test]
fn read_name_at_mid_buffer_succeeds_after_advance() {
    // 'x/Type ' で advance 後 (pos == 1) に呼び Some(b"Type")・pos == 6 を確認する
    let mut lexer = Lexer::new(b"x/Type ");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_name_failure_at_mid_buffer_rolls_back_to_call_site() {
    // 'xabc' で advance 後 (pos == 1) に呼び None・pos == 1 巻き戻しを確認する
    let mut lexer = Lexer::new(b"xabc");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_name_invalid_escape_at_mid_buffer_reads_literal_hash() {
    // 'x/A#' で advance 後 (pos == 1) に不正エスケープ → Some(b"A#")・pos == 4 を確認する
    let mut lexer = Lexer::new(b"x/A#");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A#".to_vec())));
    assert_eq!(lexer.position(), 4);
}
