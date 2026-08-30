use super::*;

// RFC 1951 §3.2.2 の例の符号ビット列が、対応するシンボルに復号されることを確認する。
#[test]
fn rfc_example_codes_decode_to_their_symbols() {
    // 符号長 3,3,3,3,3,2,4,4 から導かれるカノニカル符号（RFC 1951 §3.2.2 の表）
    let lengths = [3, 3, 3, 3, 3, 2, 4, 4];
    let cases: [(&str, u16); 8] = [
        ("010", 0),
        ("011", 1),
        ("100", 2),
        ("101", 3),
        ("110", 4),
        ("00", 5),
        ("1110", 6),
        ("1111", 7),
    ];

    for (code, expected) in cases {
        assert_eq!(
            decode_code(&lengths, code),
            Ok(expected),
            "code {code} should decode to symbol {expected}"
        );
    }
}

// 全シンボルが 1 ビットの最小の符号木で復号できることを確認する。
#[test]
fn single_bit_codes_decode_both_symbols() {
    assert_eq!(decode_code(&[1, 1], "0"), Ok(0));
    assert_eq!(decode_code(&[1, 1], "1"), Ok(1));
}

// 許される最長符号（15 ビット）を読んで復号できることを確認する。
#[test]
fn fifteen_bit_code_decodes() {
    // 符号長 1..=14 が 1 個ずつ、15 ビットが 2 個で Kraft の等号が成立する
    let lengths = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 15];

    assert_eq!(decode_code(&lengths, "111111111111110"), Ok(14));
    assert_eq!(decode_code(&lengths, "111111111111111"), Ok(15));
}

// 固定 Huffman 符号表（RFC 1951 §3.2.6）の代表シンボルが規定のビット幅で復号されることを確認する。
#[test]
fn fixed_literal_table_decodes_representative_symbols() {
    let tables = HuffmanTables::fixed().expect("fixed tables should build");
    // 0..=143 は 8 ビット（00110000〜）、144..=255 は 9 ビット（110010000〜）、
    // 256..=279 は 7 ビット（0000000〜）、280..=287 は 8 ビット（11000000〜）
    let cases: [(&str, u16); 6] = [
        ("00110000", 0),
        ("10111111", 143),
        ("110010000", 144),
        ("111111111", 255),
        ("0000000", 256),
        ("11000101", 285),
    ];

    for (code, expected) in cases {
        let bytes = pack_bits(code);
        let mut reader = BitReader::new(&bytes);

        assert_eq!(
            tables.literal.decode(&mut reader),
            Ok(expected),
            "code {code} should decode to symbol {expected}"
        );
    }
}

// 固定 Huffman の距離符号が 5 ビット固定で復号されることを確認する。
#[test]
fn fixed_distance_table_decodes_five_bit_codes() {
    let tables = HuffmanTables::fixed().expect("fixed tables should build");
    let cases: [(&str, u16); 3] = [("00000", 0), ("00001", 1), ("11101", 29)];

    for (code, expected) in cases {
        let bytes = pack_bits(code);
        let mut reader = BitReader::new(&bytes);

        assert_eq!(
            tables.distance.decode(&mut reader),
            Ok(expected),
            "code {code} should decode to distance symbol {expected}"
        );
    }
}
