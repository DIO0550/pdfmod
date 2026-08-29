use super::*;

// raw deflate（zlib ラッパ無し）を decode_raw で展開できることを確認する。
#[test]
fn raw_deflate_decodes_without_header_or_checksum() {
    // CB 48 CD C9 C9 07 00: "hello" の固定 Huffman ブロックのみ
    let input = [0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00];

    assert_eq!(
        decode_raw(&input),
        Ok(b"hello".to_vec()),
        "decode_raw should not require a zlib wrapper"
    );
}

// zlib 形式のバイト列を decode_raw に渡すと、ヘッダ 2 バイトを DEFLATE として読んで失敗することを確認する。
#[test]
fn zlib_stream_passed_to_decode_raw_is_rejected() {
    let input = [
        0x78, 0x01, 0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00, 0x06, 0x2C, 0x02, 0x15,
    ];

    // 0x78 = 0b0111_1000 を LSB-first で読むと BFINAL=0 / BTYPE=00 になる。バイト境界へ
    // 切り上げた先の 0x01 0xCB が LEN、0x48 0xCD が NLEN として読まれ、
    // LEN=0xCB01 の補数は 0x34FE なので NLEN=0xCD48 とは一致しない
    let error = decode_raw(&input).expect_err("zlib header must not be skipped by decode_raw");

    assert_eq!(
        error.kind,
        FlateErrorKind::StoredLengthMismatch {
            len: 0xCB01,
            nlen: 0xCD48,
        }
    );
}

// raw deflate を decode_zlib に渡すと zlib ヘッダ検証で弾かれることを確認する。
#[test]
fn raw_deflate_passed_to_decode_zlib_is_rejected_by_header_check() {
    let input = [0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00];

    assert_eq!(
        decode_zlib_err(&input),
        FlateErrorKind::UnsupportedCompressionMethod { actual: 0x0B }
    );
}
