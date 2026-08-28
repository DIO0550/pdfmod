use super::*;

// 固定 Huffman ブロック（BTYPE=01）の zlib ストリームを展開できることを確認する。
#[test]
fn fixed_huffman_stream_decodes_to_original_bytes() {
    // 78 01                   zlib ヘッダ
    // CB 48 CD C9 C9 07 00    BFINAL=1 / BTYPE=01 と "hello" の固定 Huffman 符号
    // 06 2C 02 15             Adler-32
    let input = [
        0x78, 0x01, 0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00, 0x06, 0x2C, 0x02, 0x15,
    ];

    assert_eq!(decode_zlib_ok(&input), b"hello");
}

// 距離 1 の重なりコピーを含む固定 Huffman ブロックを展開できることを確認する。
#[test]
fn overlapping_copy_stream_decodes_to_repeated_bytes() {
    // 4B 4C 04 01 00: リテラル 'a' + 長さ 5 / 距離 1 の後方参照 + ブロック終端
    let input = [
        0x78, 0x01, 0x4B, 0x4C, 0x04, 0x01, 0x00, 0x07, 0xFB, 0x02, 0x47,
    ];

    assert_eq!(decode_zlib_ok(&input), b"aaaaaa");
}

// 長さシンボル 285（長さ 258）の最大コピーを含むブロックを展開できることを確認する。
#[test]
fn maximum_length_copy_decodes_258_bytes() {
    // 4B 1C 05 00: リテラル 'a'（符号 10010001）+ 長さシンボル 285（符号 11000101、
    // 追加ビット無し）+ 距離シンボル 0（符号 00000）+ ブロック終端（符号 0000000）
    let input = [0x78, 0x01, 0x4B, 0x1C, 0x05, 0x00, 0xD9, 0xA8, 0x62, 0x24];

    assert_eq!(decode_zlib_ok(&input), vec![b'a'; 259]);
}
