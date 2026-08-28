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

/// 固定 Huffman のリテラル／長さ符号長表（RFC 1951 §3.2.6）。
///
/// 0..=143 が 8 ビット、144..=255 が 9 ビット、256..=279 が 7 ビット、280..=287 が 8 ビット。
pub fn fixed_literal_lengths() -> [u8; LITERAL_SYMBOLS] {
    let mut lengths = [8_u8; LITERAL_SYMBOLS];
    for (symbol, length) in lengths.iter_mut().enumerate() {
        *length = match symbol {
            0..=143 => 8,
            144..=255 => 9,
            256..=279 => 7,
            _ => 8,
        };
    }
    lengths
}

/// 固定 Huffman の距離符号長表。全 32 シンボルが 5 ビット固定。
pub fn fixed_distance_lengths() -> [u8; DISTANCE_SYMBOLS] {
    [5_u8; DISTANCE_SYMBOLS]
}

#[cfg(test)]
mod tests {
    use super::*;

    // 固定符号長表が RFC 1951 §3.2.6 の 4 区間どおりに埋まることを確認する。
    #[test]
    fn fixed_literal_lengths_follow_four_ranges() {
        let lengths = fixed_literal_lengths();
        let cases: [(usize, u8); 8] = [
            (0, 8),
            (143, 8),
            (144, 9),
            (255, 9),
            (256, 7),
            (279, 7),
            (280, 8),
            (287, 8),
        ];

        for (symbol, expected) in cases {
            assert_eq!(
                lengths.get(symbol).copied(),
                Some(expected),
                "symbol {symbol} should have length {expected}"
            );
        }
    }

    // 距離符号長表が全シンボル 5 ビットで埋まることを確認する。
    #[test]
    fn fixed_distance_lengths_are_all_five_bits() {
        let lengths = fixed_distance_lengths();

        assert!(
            lengths.iter().all(|&length| length == 5),
            "all distance code lengths should be 5"
        );
    }

    // 長さ／距離の基準値表と追加ビット表の要素数が対応していることを確認する。
    #[test]
    fn base_and_extra_bit_tables_have_matching_lengths() {
        assert_eq!(LENGTH_BASE.len(), LENGTH_EXTRA_BITS.len());
        assert_eq!(DISTANCE_BASE.len(), DISTANCE_EXTRA_BITS.len());
    }
}
