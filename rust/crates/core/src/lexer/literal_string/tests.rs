use super::*;

mod basic;
mod eol_normalize;
mod escape;
mod guard;
mod line_continuation;
mod nest;
mod octal;

// ========================================================================
// Phase 11-H: 未知エスケープ（バックスラッシュ捨て）
// ========================================================================

#[test]
fn read_literal_string_unknown_escape_drops_backslash() {
    // b"(\\x)" で未知エスケープがバックスラッシュ捨て + 'x' 保持となり pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\x)");
    assert_eq!(lexer.read_literal_string(), Some(b"x".to_vec()));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_literal_string_unknown_escape_with_exclamation() {
    // b"(\\!)" で未知エスケープ '!' をそのまま保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\!)");
    assert_eq!(lexer.read_literal_string(), Some(b"!".to_vec()));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_literal_string_unknown_escape_with_uppercase_letter() {
    // b"(\\A)" で 8 進数字外の 'A' を未知エスケープ扱いで保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\\A)");
    assert_eq!(lexer.read_literal_string(), Some(b"A".to_vec()));
    assert_eq!(lexer.position(), 4);
}

// ========================================================================
// Phase 11-I: 未終端 / 巻き戻し（異常系）
// ========================================================================

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

// ========================================================================
// Phase 11-J: 非 ASCII / NUL / 高位バイト保持
// ========================================================================

#[test]
fn read_literal_string_preserves_nul_byte() {
    // b"(\x00)" で NUL バイトをそのまま保持し pos == 3 を返すことを確認する
    let mut lexer = Lexer::new(b"(\x00)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_literal_string_preserves_high_byte() {
    // b"(\xFF)" で 0xFF バイトをそのまま保持し pos == 3 を返すことを確認する
    let mut lexer = Lexer::new(b"(\xFF)");
    assert_eq!(lexer.read_literal_string(), Some(b"\xFF".to_vec()));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_literal_string_preserves_non_utf8_sequence() {
    // b"(\x80\xC0)" で非 UTF-8 連続バイト列をそのまま保持し pos == 4 を返すことを確認する
    let mut lexer = Lexer::new(b"(\x80\xC0)");
    assert_eq!(lexer.read_literal_string(), Some(b"\x80\xC0".to_vec()));
    assert_eq!(lexer.position(), 4);
}

// ========================================================================
// decode_escape 純関数の単体テスト
// ========================================================================

#[test]
fn decode_escape_decodes_simple_n() {
    // input=b"\\n" pos=0 で decode_escape が (Some(0x0A), 2) を返すことを確認する
    let input = b"\\n";
    assert_eq!(decode_escape(input, 0), Some((Some(0x0A), 2)));
}

#[test]
fn decode_escape_decodes_simple_backslash() {
    // input=b"\\\\" pos=0 で decode_escape が (Some(b'\\'), 2) を返すことを確認する
    let input = b"\\\\";
    assert_eq!(decode_escape(input, 0), Some((Some(b'\\'), 2)));
}

#[test]
fn decode_escape_decodes_octal_three_digits() {
    // input=b"\\101" pos=0 で decode_escape が (Some(0x41), 4) を返すことを確認する
    let input = b"\\101";
    assert_eq!(decode_escape(input, 0), Some((Some(0x41), 4)));
}

#[test]
fn decode_escape_decodes_octal_two_digits_terminated_by_non_octal() {
    // input=b"\\12x" pos=0 で 2 桁で打ち止めとなり (Some(0x0A), 3) を返すことを確認する
    let input = b"\\12x";
    assert_eq!(decode_escape(input, 0), Some((Some(0x0A), 3)));
}

#[test]
fn decode_escape_decodes_octal_overflow_mod_256() {
    // input=b"\\777" pos=0 で 8 進 511 を下位 8 ビット採用で (Some(0xFF), 4) を返すことを確認する
    let input = b"\\777";
    assert_eq!(decode_escape(input, 0), Some((Some(0xFF), 4)));
}

#[test]
fn decode_escape_returns_skip_for_line_continuation_lf() {
    // input=b"\\\n" pos=0 で行継続 LF が (None, 2) を返すことを確認する
    let input = b"\\\n";
    assert_eq!(decode_escape(input, 0), Some((None, 2)));
}

#[test]
fn decode_escape_returns_skip_for_line_continuation_crlf() {
    // input=b"\\\r\n" pos=0 で行継続 CRLF が (None, 3) を返すことを確認する
    let input = b"\\\r\n";
    assert_eq!(decode_escape(input, 0), Some((None, 3)));
}

#[test]
fn decode_escape_returns_skip_for_line_continuation_cr() {
    // input=b"\\\r" pos=0 で行継続 CR が (None, 2) を返すことを確認する
    let input = b"\\\r";
    assert_eq!(decode_escape(input, 0), Some((None, 2)));
}

#[test]
fn decode_escape_returns_skip_for_eof_after_backslash() {
    // input=b"\\" pos=0 で \\ 直後 EOF が (None, 1) を返すことを確認する
    let input = b"\\";
    assert_eq!(decode_escape(input, 0), Some((None, 1)));
}

#[test]
fn decode_escape_decodes_unknown_to_literal() {
    // input=b"\\x" pos=0 で未知エスケープが (Some(b'x'), 2) を返すことを確認する
    let input = b"\\x";
    assert_eq!(decode_escape(input, 0), Some((Some(b'x'), 2)));
}

// decode_escape 簡易エスケープ 8 種網羅（n / \\ は既出）

#[test]
fn decode_escape_decodes_simple_r() {
    // input=b"\\r" pos=0 で decode_escape が (Some(0x0D), 2) を返すことを確認する
    let input = b"\\r";
    assert_eq!(decode_escape(input, 0), Some((Some(0x0D), 2)));
}

#[test]
fn decode_escape_decodes_simple_t() {
    // input=b"\\t" pos=0 で decode_escape が (Some(0x09), 2) を返すことを確認する
    let input = b"\\t";
    assert_eq!(decode_escape(input, 0), Some((Some(0x09), 2)));
}

#[test]
fn decode_escape_decodes_simple_b() {
    // input=b"\\b" pos=0 で decode_escape が (Some(0x08), 2) を返すことを確認する
    let input = b"\\b";
    assert_eq!(decode_escape(input, 0), Some((Some(0x08), 2)));
}

#[test]
fn decode_escape_decodes_simple_f() {
    // input=b"\\f" pos=0 で decode_escape が (Some(0x0C), 2) を返すことを確認する
    let input = b"\\f";
    assert_eq!(decode_escape(input, 0), Some((Some(0x0C), 2)));
}

#[test]
fn decode_escape_decodes_simple_left_paren() {
    // input=b"\\(" pos=0 で decode_escape が (Some(b'('), 2) を返すことを確認する
    let input = b"\\(";
    assert_eq!(decode_escape(input, 0), Some((Some(b'('), 2)));
}

#[test]
fn decode_escape_decodes_simple_right_paren() {
    // input=b"\\)" pos=0 で decode_escape が (Some(b')'), 2) を返すことを確認する
    let input = b"\\)";
    assert_eq!(decode_escape(input, 0), Some((Some(b')'), 2)));
}

// ========================================================================
// decode_octal 内部ヘルパの直接単体テスト
// ========================================================================

#[test]
fn decode_octal_one_digit_zero() {
    // input=b"0" digits_start=0 で 1 桁 8 進 0 が (Some(0x00), 2) を返すことを確認する
    let input = b"0";
    assert_eq!(decode_octal(input, 0), Some((Some(0x00), 2)));
}

#[test]
fn decode_octal_one_digit_seven() {
    // input=b"7" digits_start=0 で 1 桁 8 進 7 が (Some(0x07), 2) を返すことを確認する
    let input = b"7";
    assert_eq!(decode_octal(input, 0), Some((Some(0x07), 2)));
}

#[test]
fn decode_octal_three_digits_max() {
    // input=b"377" digits_start=0 で 3 桁 8 進 255 が (Some(0xFF), 4) を返すことを確認する
    let input = b"377";
    assert_eq!(decode_octal(input, 0), Some((Some(0xFF), 4)));
}

#[test]
fn decode_octal_three_digits_400_wraps_to_zero() {
    // input=b"400" digits_start=0 で 3 桁 8 進 256 が下位 8 ビット採用で (Some(0x00), 4) を返すことを確認する
    let input = b"400";
    assert_eq!(decode_octal(input, 0), Some((Some(0x00), 4)));
}

#[test]
fn decode_octal_three_digits_zero() {
    // input=b"000" digits_start=0 で 3 桁全 0 が (Some(0x00), 4) を返し digits == 3 で greedy 打ち止めを確認する
    let input = b"000";
    assert_eq!(decode_octal(input, 0), Some((Some(0x00), 4)));
}

#[test]
fn decode_octal_terminated_by_non_octal_after_one_digit() {
    // input=b"1x" digits_start=0 で 1 桁で打ち止めとなり (Some(0x01), 2) を返すことを確認する
    let input = b"1x";
    assert_eq!(decode_octal(input, 0), Some((Some(0x01), 2)));
}
