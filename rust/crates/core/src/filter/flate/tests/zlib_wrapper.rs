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
fn zlib_stream_passed_to_decode_raw_is_not_silently_accepted() {
    let input = [
        0x78, 0x01, 0xCB, 0x48, 0xCD, 0xC9, 0xC9, 0x07, 0x00, 0x06, 0x2C, 0x02, 0x15,
    ];

    assert!(
        decode_raw(&input) != Ok(b"hello".to_vec()),
        "zlib header must not be skipped by decode_raw"
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
