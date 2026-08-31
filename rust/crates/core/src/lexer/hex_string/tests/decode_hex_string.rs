use super::super::*;

// --- 正常系: 基本 ---

#[test]
fn decode_hex_string_returns_empty_bytes_for_empty_string() {
    // 最小の受理入力 <> は空バイト列と '>' 直後の位置 2 を返す
    assert_eq!(decode_hex_string(b"<>", 0), Some((vec![], 2)));
}

#[test]
fn decode_hex_string_decodes_even_digits() {
    assert_eq!(
        decode_hex_string(b"<48656C6C6F>", 0),
        Some((b"Hello".to_vec(), 12))
    );
}

#[test]
fn decode_hex_string_next_points_just_after_closing_angle() {
    // 後続バイトがあっても next は '>' の直後 (= 4) を指す
    assert_eq!(decode_hex_string(b"<41>xyz", 0), Some((vec![0x41], 4)));
}

// --- 正常系: 大小文字 ---

#[test]
fn decode_hex_string_treats_upper_and_lower_case_as_equivalent() {
    let upper = decode_hex_string(b"<ABCDEF>", 0);
    let lower = decode_hex_string(b"<abcdef>", 0);
    assert_eq!(upper, lower);
    assert_eq!(upper, Some((vec![0xAB, 0xCD, 0xEF], 8)));
}

// --- 正常系: whitespace ---

#[test]
fn decode_hex_string_skips_whitespace_between_digits() {
    // whitespace はスキップされるが next には消費バイトとして反映される
    assert_eq!(
        decode_hex_string(b"<41 42>", 0),
        Some((vec![0x41, 0x42], 7))
    );
}

#[test]
fn decode_hex_string_skips_every_whitespace_byte() {
    // PDF §7.2.2 の 6 種: NUL/TAB/LF/FF/CR/SP
    for ws in [0x00u8, 0x09, 0x0A, 0x0C, 0x0D, 0x20] {
        let input = [b'<', b'4', ws, b'1', b'>'];
        assert_eq!(
            decode_hex_string(&input, 0),
            Some((vec![0x41], 5)),
            "whitespace byte {ws:#04X} should be skipped"
        );
    }
}

// --- 境界値: 奇数桁の 0 補完 ---

#[test]
fn decode_hex_string_pads_single_digit_with_zero() {
    assert_eq!(decode_hex_string(b"<F>", 0), Some((vec![0xF0], 3)));
}

#[test]
fn decode_hex_string_pads_odd_digit_before_whitespace() {
    // 補完は「'>' 到達時に high が残っているか」で決まる。間の whitespace は影響しない
    assert_eq!(
        decode_hex_string(b"<41 5 >", 0),
        Some((vec![0x41, 0x50], 7))
    );
}

// --- 境界値: pos が 0 以外 / 範囲外 ---

#[test]
fn decode_hex_string_accepts_non_zero_pos_and_returns_absolute_next() {
    // 先頭 3 バイトを読み飛ばした位置から開始。next は絶対オフセット
    assert_eq!(decode_hex_string(b"xyz<41>", 3), Some((vec![0x41], 7)));
}

#[test]
fn decode_hex_string_returns_none_when_pos_is_out_of_range() {
    assert_eq!(decode_hex_string(b"<41>", 99), None);
}

#[test]
fn decode_hex_string_does_not_panic_when_pos_is_usize_max() {
    assert_eq!(decode_hex_string(b"<41>", usize::MAX), None);
}

// --- 異常系 ---

#[test]
fn decode_hex_string_returns_none_for_non_hex_byte() {
    assert_eq!(decode_hex_string(b"<41X2>", 0), None);
}

#[test]
fn decode_hex_string_returns_none_for_unterminated_input() {
    assert_eq!(decode_hex_string(b"<4142", 0), None);
}

#[test]
fn decode_hex_string_returns_none_for_double_open_angle() {
    // '<' は hex 数字でも whitespace でも '>' でもないため不正バイト扱い
    assert_eq!(decode_hex_string(b"<<41>", 0), None);
}

#[test]
fn decode_hex_string_returns_none_when_not_starting_with_open_angle() {
    assert_eq!(decode_hex_string(b"41>", 0), None);
}

#[test]
fn decode_hex_string_returns_none_for_empty_input() {
    assert_eq!(decode_hex_string(b"", 0), None);
}

// --- エッジケース: バイト保持 ---

#[test]
fn decode_hex_string_preserves_high_and_null_bytes() {
    assert_eq!(
        decode_hex_string(b"<00FF80>", 0),
        Some((vec![0x00, 0xFF, 0x80], 8))
    );
}

#[test]
fn decode_hex_string_preserves_invalid_utf8_sequence() {
    // 0xC3 単独は不正な UTF-8 だが、lexer はバイト列として忠実に保持する
    assert_eq!(decode_hex_string(b"<C3>", 0), Some((vec![0xC3], 4)));
}
