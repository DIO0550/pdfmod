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
