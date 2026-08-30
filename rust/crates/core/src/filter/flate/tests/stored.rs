use super::*;

// 非圧縮ブロック（BTYPE=00）だけの zlib ストリームを展開できることを確認する。
#[test]
fn stored_block_stream_decodes_to_original_bytes() {
    // 78 01       zlib ヘッダ（CM=8 / CINFO=7）
    // 01          BFINAL=1 / BTYPE=00
    // 03 00       LEN=3
    // FC FF       NLEN=!3
    // 61 62 63    "abc"
    // 02 4D 01 27 Adler-32
    let input = [
        0x78, 0x01, 0x01, 0x03, 0x00, 0xFC, 0xFF, 0x61, 0x62, 0x63, 0x02, 0x4D, 0x01, 0x27,
    ];

    assert_eq!(decode_zlib_ok(&input), b"abc");
}

// LEN と NLEN が補数関係にない非圧縮ブロックが StoredLengthMismatch になることを確認する。
#[test]
fn stored_block_with_mismatched_nlen_is_rejected() {
    // NLEN を FC FF から FC FE に変えて補数関係を崩す
    let input = [
        0x78, 0x01, 0x01, 0x03, 0x00, 0xFC, 0xFE, 0x61, 0x62, 0x63, 0x02, 0x4D, 0x01, 0x27,
    ];

    assert_eq!(
        decode_zlib_err(&input),
        FlateErrorKind::StoredLengthMismatch {
            len: 3,
            nlen: 0xFEFC,
        }
    );
}

// LEN が実データより大きい非圧縮ブロックが UnexpectedEof になることを確認する。
#[test]
fn stored_block_with_missing_data_reports_unexpected_eof() {
    // LEN=5 だが実データは 3 バイトしかない
    let input = [
        0x78, 0x01, 0x01, 0x05, 0x00, 0xFA, 0xFF, 0x61, 0x62, 0x63, 0x02, 0x4D, 0x01, 0x27,
    ];

    assert_eq!(decode_zlib_err(&input), FlateErrorKind::UnexpectedEof);
}

// LEN=0 の非圧縮ブロックが空の展開結果になることを確認する。
#[test]
fn stored_block_with_zero_length_decodes_to_empty_output() {
    // 01 00 00 FF FF: BFINAL=1 / BTYPE=00 / LEN=0 / NLEN=0xFFFF
    // 00 00 00 01: 空データの Adler-32（初期値 1）
    let input = [
        0x78, 0x01, 0x01, 0x00, 0x00, 0xFF, 0xFF, 0x00, 0x00, 0x00, 0x01,
    ];

    assert_eq!(decode_zlib_ok(&input), b"");
}
