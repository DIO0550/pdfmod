use super::super::*;

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
