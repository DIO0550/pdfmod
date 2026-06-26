use super::*;

mod basic;
mod byte_preservation;
mod decode_escape;
mod eol_normalize;
mod error;
mod escape;
mod guard;
mod line_continuation;
mod nest;
mod octal;
mod unknown_escape;

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
