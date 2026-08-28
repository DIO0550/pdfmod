use super::*;

// 予約されたブロック種別（BTYPE=11）が ReservedBlockType になることを確認する。
#[test]
fn reserved_block_type_is_rejected() {
    // 07: BFINAL=1 / BTYPE=11（予約値）
    let input = [0x78, 0x01, 0x07];

    assert_eq!(
        decode_zlib_err(&input),
        FlateErrorKind::ReservedBlockType { actual: 3 }
    );
}

// 空入力とヘッダのみの入力が UnexpectedEof になることを確認する。
#[test]
fn truncated_stream_reports_unexpected_eof() {
    let cases: [&[u8]; 2] = [&[], &[0x78, 0x01]];

    for input in cases {
        assert_eq!(
            decode_zlib_err(input),
            FlateErrorKind::UnexpectedEof,
            "input {input:02X?} should report eof"
        );
    }
}

// トレーラの Adler-32 が展開結果と一致しない場合に ChecksumMismatch になることを確認する。
#[test]
fn checksum_mismatch_is_reported_with_both_values() {
    // 末尾 4 バイトを 0 に書き換えたストリーム（本来は 02 4D 01 27）
    let input = [
        0x78, 0x01, 0x01, 0x03, 0x00, 0xFC, 0xFF, 0x61, 0x62, 0x63, 0x00, 0x00, 0x00, 0x00,
    ];

    assert_eq!(
        decode_zlib_err(&input),
        FlateErrorKind::ChecksumMismatch {
            expected: 0,
            actual: 0x024D_0127,
        }
    );
}

// トレーラが欠落している（展開は成功するが 4 バイト足りない）場合に UnexpectedEof になることを確認する。
#[test]
fn missing_checksum_reports_unexpected_eof() {
    let input = [0x78, 0x01, 0x01, 0x03, 0x00, 0xFC, 0xFF, 0x61, 0x62, 0x63];

    assert_eq!(decode_zlib_err(&input), FlateErrorKind::UnexpectedEof);
}

// 正常なストリームを 1 バイトずつ短くしても、どの長さでも panic せず結果を返すことを確認する。
#[test]
fn every_truncation_of_a_valid_stream_returns_without_panicking() {
    // 固定 Huffman ブロックの "hello"
    let input = [
        0x78, 0x01, 0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00, 0x06, 0x2C, 0x02, 0x15,
    ];

    for len in 0..input.len() {
        let truncated = input.get(..len).unwrap_or(&[]);

        assert!(
            decode_zlib(truncated).is_err(),
            "truncated stream of {len} bytes should fail, not panic"
        );
    }
}

// 先頭 16 バイトを 1 ビットずつ反転させた入力でも panic しないことを確認する。
#[test]
fn single_bit_flips_never_panic() {
    // 動的 Huffman ブロック（HLIT=286 / HDIST=30）を含むストリーム
    let input = [
        0x78, 0x01, 0xED, 0x1D, 0x01, 0x20, 0x10, 0x30, 0x0C, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA,
        0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xAA, 0xED, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF,
        0xFF, 0xFF, 0xFF, 0x0D, 0x1F, 0xC3, 0x23, 0x03, 0xCE, 0x01, 0x85,
    ];

    for byte_index in 0..16 {
        for bit in 0..8 {
            let mut corrupted = input;
            if let Some(byte) = corrupted.get_mut(byte_index) {
                *byte ^= 1 << bit;
            }

            // Ok / Err のどちらでもよい。panic せず戻ることだけを確認する
            let _ = decode_zlib(&corrupted);
        }
    }
}

// 同じバイトが続く（圧縮率の高い）ストリームで展開が終了し、無限ループにならないことを確認する。
#[test]
fn highly_compressible_stream_terminates() {
    // リテラル 'a' + 長さ 258 / 距離 1 の最大コピー
    let input = [0x78, 0x01, 0x4B, 0x1C, 0x05, 0x00, 0xD9, 0xA8, 0x62, 0x24];

    assert_eq!(decode_zlib_ok(&input).len(), 259);
}
