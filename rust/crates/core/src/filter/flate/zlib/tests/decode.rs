use super::super::*;
use crate::filter::error::FlateErrorKind;

// zlib ラッパ（ヘッダ + 本体 + Adler-32）を通しで解釈できることを確認する。
#[test]
fn wrapped_stream_decodes_through_header_body_and_trailer() {
    // 78 01: ヘッダ / CB 48 CD C9 C9 07 00: "hello" の固定 Huffman ブロック
    // 06 2C 02 15: Adler-32
    let input = [
        0x78, 0x01, 0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00, 0x06, 0x2C, 0x02, 0x15,
    ];

    assert_eq!(decode(&input), Ok(b"hello".to_vec()));
}

// トレーラの Adler-32 が展開結果と一致しない場合に ChecksumMismatch になることを確認する。
#[test]
fn checksum_mismatch_reports_both_values() {
    // 末尾 4 バイトを 0 に書き換えたストリーム（本来は 02 4D 01 27）
    let input = [
        0x78, 0x01, 0x01, 0x03, 0x00, 0xFC, 0xFF, 0x61, 0x62, 0x63, 0x00, 0x00, 0x00, 0x00,
    ];

    assert_eq!(
        decode(&input).expect_err("checksum must not match").kind,
        FlateErrorKind::ChecksumMismatch {
            expected: 0,
            actual: 0x024D_0127,
        }
    );
}

// ビッグエンディアン 4 バイトの読み出しが、境界値と短いスライスで壊れないことを確認する。
#[test]
fn read_be_u32_joins_bytes_and_pads_short_slices() {
    let cases: [(&[u8], u32); 4] = [
        (&[0x00, 0x00, 0x00, 0x00], 0),
        (&[0x02, 0x4D, 0x01, 0x27], 0x024D_0127),
        (&[0xFF, 0xFF, 0xFF, 0xFF], u32::MAX),
        // take_bytes(4) の戻り値以外は渡らないが、短いスライスでも panic しない
        (&[0x01, 0x02], 0x0102),
    ];

    for (bytes, expected) in cases {
        assert_eq!(
            read_be_u32(bytes),
            expected,
            "read_be_u32({bytes:02X?}) should be {expected:#010X}"
        );
    }
}
