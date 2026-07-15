use super::super::*;

#[test]
fn decode_literal_string_returns_none_for_empty_input() {
    // 空入力 b"" pos=0 で None を返すことを確認する
    let input = b"";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_returns_none_for_non_paren_head() {
    // 先頭が '(' でない input=b"babc" pos=0 で None を返すことを確認する
    let input = b"babc";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_decodes_empty_string() {
    // input=b"()" pos=0 で (空の Vec, next=2) を返すことを確認する
    let input = b"()";
    assert_eq!(decode_literal_string(input, 0), Some((Vec::new(), 2)));
}

#[test]
fn decode_literal_string_decodes_simple_ascii() {
    // input=b"(abc)" pos=0 で (b"abc", next=5) を返すことを確認する
    let input = b"(abc)";
    assert_eq!(decode_literal_string(input, 0), Some((b"abc".to_vec(), 5)));
}

#[test]
fn decode_literal_string_returns_next_after_closing_paren_at_mid_position() {
    // input=b"xx(ab)yy" pos=2 で (b"ab", next=6=閉じ ')' 直後) を返し後続を消費しないことを確認する
    let input = b"xx(ab)yy";
    assert_eq!(decode_literal_string(input, 2), Some((b"ab".to_vec(), 6)));
}

#[test]
fn decode_literal_string_decodes_single_level_nest() {
    // input=b"(a(b)c)" pos=0 で内側の括弧をバイトとして含む (b"a(b)c", next=7) を返すことを確認する
    let input = b"(a(b)c)";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((b"a(b)c".to_vec(), 7))
    );
}

#[test]
fn decode_literal_string_decodes_three_level_nest() {
    // input=b"(((x)))" pos=0 で深さ 3 のネストを (b"((x))", next=7) として返すことを確認する
    let input = b"(((x)))";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((b"((x))".to_vec(), 7))
    );
}

#[test]
fn decode_literal_string_decodes_sibling_nests() {
    // input=b"((a)(b))" pos=0 で同一深度の兄弟ネストを (b"(a)(b)", next=8) として返すことを確認する
    let input = b"((a)(b))";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((b"(a)(b)".to_vec(), 8))
    );
}

#[test]
fn decode_literal_string_returns_none_for_unterminated_nest() {
    // 内側は閉じたが外側が未終端の input=b"(a(b)" pos=0 で None を返すことを確認する
    let input = b"(a(b)";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_decodes_escape_n() {
    // input=b"(\\n)" pos=0 でエスケープ \n を 0x0A 1 バイトとして (vec![0x0A], next=4) を返すことを確認する
    let input = b"(\\n)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x0A], 4)));
}

#[test]
fn decode_literal_string_decodes_escape_r() {
    // input=b"(\\r)" pos=0 でエスケープ \r を 0x0D 1 バイトとして (vec![0x0D], next=4) を返すことを確認する
    let input = b"(\\r)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x0D], 4)));
}

#[test]
fn decode_literal_string_decodes_escape_t() {
    // input=b"(\\t)" pos=0 でエスケープ \t を 0x09 1 バイトとして (vec![0x09], next=4) を返すことを確認する
    let input = b"(\\t)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x09], 4)));
}

#[test]
fn decode_literal_string_decodes_escape_b() {
    // input=b"(\\b)" pos=0 でエスケープ \b を 0x08 1 バイトとして (vec![0x08], next=4) を返すことを確認する
    let input = b"(\\b)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x08], 4)));
}

#[test]
fn decode_literal_string_decodes_escape_f() {
    // input=b"(\\f)" pos=0 でエスケープ \f を 0x0C 1 バイトとして (vec![0x0C], next=4) を返すことを確認する
    let input = b"(\\f)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x0C], 4)));
}

#[test]
fn decode_literal_string_decodes_escape_left_paren() {
    // input=b"(\\()" pos=0 でエスケープ \( を depth に影響させず (b"(", next=4) を返すことを確認する
    let input = b"(\\()";
    assert_eq!(decode_literal_string(input, 0), Some((b"(".to_vec(), 4)));
}

#[test]
fn decode_literal_string_decodes_escape_right_paren() {
    // input=b"(\\))" pos=0 でエスケープ \) を depth に影響させず (b")", next=4) を返すことを確認する
    let input = b"(\\))";
    assert_eq!(decode_literal_string(input, 0), Some((b")".to_vec(), 4)));
}

#[test]
fn decode_literal_string_decodes_escape_backslash() {
    // input=b"(\\\\)" pos=0 でエスケープ \\ を b'\\' 1 バイトとして (b"\\", next=4) を返すことを確認する
    let input = b"(\\\\)";
    assert_eq!(decode_literal_string(input, 0), Some((b"\\".to_vec(), 4)));
}

#[test]
fn decode_literal_string_decodes_octal_three_digits() {
    // input=b"(\\101)" pos=0 で 8 進 3 桁 \101 を b'A' として (b"A", next=6) を返すことを確認する
    let input = b"(\\101)";
    assert_eq!(decode_literal_string(input, 0), Some((b"A".to_vec(), 6)));
}

#[test]
fn decode_literal_string_decodes_octal_terminated_by_non_octal_digit() {
    // input=b"(\\12x)" pos=0 で 8 進 2 桁で打ち止めとなり (vec![0x0A, b'x'], next=6) を返すことを確認する
    let input = b"(\\12x)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x0A, b'x'], 6)));
}

#[test]
fn decode_literal_string_decodes_octal_overflow_mod_256() {
    // input=b"(\\777)" pos=0 で 8 進 511 の下位 8 ビット採用により (vec![0xFF], next=6) を返すことを確認する
    let input = b"(\\777)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0xFF], 6)));
}

#[test]
fn decode_literal_string_decodes_unknown_escape_to_literal() {
    // input=b"(\\x)" pos=0 で未知エスケープの \ のみ捨てて (b"x", next=4) を返すことを確認する
    let input = b"(\\x)";
    assert_eq!(decode_literal_string(input, 0), Some((b"x".to_vec(), 4)));
}

#[test]
fn decode_literal_string_returns_none_for_escaped_closing_paren_only() {
    // エスケープされた閉じ括弧が終端にならない input=b"(\\)" pos=0 で None（未終端扱い）を返すことを確認する
    let input = b"(\\)";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_returns_none_for_eof_right_after_backslash() {
    // \ 直後 EOF の input=b"(\\" pos=0 で None を返すことを確認する
    let input = b"(\\";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_returns_none_for_eof_right_after_octal_escape() {
    // 8 進エスケープ直後に EOF となる input=b"(\\10" pos=0 で None を返すことを確認する
    let input = b"(\\10";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_normalizes_bare_lf_to_lf() {
    // input=b"(a\nb)" pos=0 で裸 LF を 0x0A として保持し (vec![b'a', 0x0A, b'b'], next=5) を返すことを確認する
    let input = b"(a\nb)";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((vec![b'a', 0x0A, b'b'], 5))
    );
}

#[test]
fn decode_literal_string_normalizes_bare_cr_to_lf() {
    // input=b"(a\rb)" pos=0 で裸 CR を 0x0A に正規化して (vec![b'a', 0x0A, b'b'], next=5) を返すことを確認する
    let input = b"(a\rb)";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((vec![b'a', 0x0A, b'b'], 5))
    );
}

#[test]
fn decode_literal_string_normalizes_bare_crlf_to_single_lf() {
    // input=b"(a\r\nb)" pos=0 で裸 CRLF を 1 個の 0x0A に正規化して (vec![b'a', 0x0A, b'b'], next=6) を返すことを確認する
    let input = b"(a\r\nb)";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((vec![b'a', 0x0A, b'b'], 6))
    );
}

#[test]
fn decode_literal_string_skips_line_continuation_lf() {
    // input=b"(a\\\nb)" pos=0 で行継続 \+LF が出力に含まれず (b"ab", next=6) を返すことを確認する
    let input = b"(a\\\nb)";
    assert_eq!(decode_literal_string(input, 0), Some((b"ab".to_vec(), 6)));
}

#[test]
fn decode_literal_string_skips_line_continuation_cr() {
    // input=b"(a\\\rb)" pos=0 で行継続 \+CR が出力に含まれず (b"ab", next=6) を返すことを確認する
    let input = b"(a\\\rb)";
    assert_eq!(decode_literal_string(input, 0), Some((b"ab".to_vec(), 6)));
}

#[test]
fn decode_literal_string_skips_line_continuation_crlf() {
    // input=b"(a\\\r\nb)" pos=0 で行継続 \+CRLF が出力に含まれず (b"ab", next=7) を返すことを確認する
    let input = b"(a\\\r\nb)";
    assert_eq!(decode_literal_string(input, 0), Some((b"ab".to_vec(), 7)));
}

#[test]
fn decode_literal_string_returns_none_for_eof_right_after_line_continuation() {
    // 行継続直後に EOF となる input=b"(a\\\n" pos=0 で None を返すことを確認する
    let input = b"(a\\\n";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_preserves_nul_bytes() {
    // input=b"(a\x00b)" pos=0 で NUL バイトを無検証で保持し (vec![b'a', 0x00, b'b'], next=5) を返すことを確認する
    let input = b"(a\x00b)";
    assert_eq!(
        decode_literal_string(input, 0),
        Some((vec![b'a', 0x00, b'b'], 5))
    );
}

#[test]
fn decode_literal_string_preserves_high_bytes() {
    // input=b"(\x80\xFF)" pos=0 で 0x80 以上の高位バイトを無検証で保持し (vec![0x80, 0xFF], next=4) を返すことを確認する
    let input = b"(\x80\xFF)";
    assert_eq!(decode_literal_string(input, 0), Some((vec![0x80, 0xFF], 4)));
}

#[test]
fn decode_literal_string_returns_none_for_pos_at_input_len() {
    // pos == input.len()（終端ちょうど）で panic せず None を返すことを確認する
    let input = b"(a)";
    assert_eq!(decode_literal_string(input, input.len()), None);
}

#[test]
fn decode_literal_string_returns_none_for_pos_beyond_input_len() {
    // pos > input.len()（範囲外）で panic せず None を返すことを確認する
    let input = b"(a)";
    assert_eq!(decode_literal_string(input, input.len() + 1), None);
}

#[test]
fn decode_literal_string_returns_none_without_panic_for_pos_usize_max() {
    // pos=usize::MAX（範囲外・overflow 境界）でも panic せず None を返すことを確認する
    let input = b"(a)";
    assert_eq!(decode_literal_string(input, usize::MAX), None);
}

#[test]
fn decode_literal_string_returns_none_for_unterminated_string() {
    // 閉じ ')' のない input=b"(abc" pos=0 で None を返すことを確認する
    let input = b"(abc";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_returns_none_for_open_paren_only() {
    // 開き括弧のみの input=b"(" pos=0 で None を返すことを確認する
    let input = b"(";
    assert_eq!(decode_literal_string(input, 0), None);
}

#[test]
fn decode_literal_string_stops_right_after_closing_paren() {
    // input=b"(a)b" pos=0 で (b"a", next=3) を返し後続の 'b' を消費しないことを確認する
    let input = b"(a)b";
    assert_eq!(decode_literal_string(input, 0), Some((b"a".to_vec(), 3)));
}
