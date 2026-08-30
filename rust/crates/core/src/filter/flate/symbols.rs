//! DEFLATE の定数表。RFC 1951 §3.2.5 - §3.2.7 に対応する。

/// 長さシンボル 257..=285 に対応する基準長。
pub const LENGTH_BASE: [u16; 29] = [
    3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131,
    163, 195, 227, 258,
];

/// 長さシンボル 257..=285 に対応する追加ビット数。
pub const LENGTH_EXTRA_BITS: [u32; 29] = [
    0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0,
];

/// 距離シンボル 0..=29 に対応する基準距離。
pub const DISTANCE_BASE: [u16; 30] = [
    1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537,
    2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577,
];

/// 距離シンボル 0..=29 に対応する追加ビット数。
pub const DISTANCE_EXTRA_BITS: [u32; 30] = [
    0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13,
    13,
];

/// 符号長符号の符号長を読む順序（RFC 1951 §3.2.7）。
pub const CODE_LENGTH_ORDER: [usize; 19] = [
    16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15,
];

/// 後方参照の最大距離（32KB ウィンドウ）。
pub const MAX_DISTANCE: usize = 32768;

/// リテラル／長さ符号のシンボル数（0..=287）。
pub const LITERAL_SYMBOLS: usize = 288;

/// 距離符号のシンボル数（0..=31）。
pub const DISTANCE_SYMBOLS: usize = 32;

/// ブロックの終端を表すシンボル。
pub const END_OF_BLOCK: u16 = 256;

#[cfg(test)]
mod tests {
    use super::*;

    // 長さ／距離の基準値表と追加ビット表の要素数が対応していることを確認する。
    #[test]
    fn base_and_extra_bit_tables_have_matching_lengths() {
        assert_eq!(LENGTH_BASE.len(), LENGTH_EXTRA_BITS.len());
        assert_eq!(DISTANCE_BASE.len(), DISTANCE_EXTRA_BITS.len());
    }

    // 符号長符号の読み出し順が 19 個の重複ない置換であることを確認する。
    #[test]
    fn code_length_order_is_a_permutation_of_all_slots() {
        let mut seen = [false; CODE_LENGTH_ORDER.len()];
        for &slot in &CODE_LENGTH_ORDER {
            let entry = seen.get_mut(slot).expect("slot should be in range");
            assert!(!*entry, "slot {slot} should appear only once");
            *entry = true;
        }

        assert!(seen.iter().all(|&hit| hit), "all slots should appear");
    }
}
