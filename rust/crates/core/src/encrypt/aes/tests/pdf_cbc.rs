use super::{hex, KEY_128, KEY_256};
use crate::encrypt::aes::{Aes, AesCbcError, Block};

const IV: &str = "a0a1a2a3a4a5a6a7a8a9aaabacadaeaf";

// CBC の各暗号文は OpenSSL で生成し、PDF の形式に合わせて先頭に IV を付ける。
fn pdf_ciphertext(blocks: &[Block]) -> Vec<u8> {
    let mut input = Vec::from(hex::<16>(IV));
    input.extend_from_slice(blocks.as_flattened());
    input
}

#[test]
fn decrypts_pdf_aes256_with_prefixed_iv_and_padding() {
    let aes = Aes::new_256(&hex(KEY_256));
    let input = pdf_ciphertext(&[
        hex("aa21ce5618972cf6990c87a0b04065eb"),
        hex("1da720b04e5dded942a216c5b4f681df"),
    ]);

    assert_eq!(aes.decrypt_pdf_cbc(&input).unwrap(), b"PDF stream block!");
}

#[test]
fn removes_a_whole_padding_block_from_aligned_plaintext() {
    let aes = Aes::new_128(&hex(KEY_128));
    let input = pdf_ciphertext(&[
        hex("0f7108e8240171ebadaae9bf29a4fa21"),
        hex("efc6d88a11d76f86b901e934bbb2cd7e"),
    ]);

    assert_eq!(aes.decrypt_pdf_cbc(&input).unwrap(), b"0123456789ABCDEF");
}

#[test]
fn strips_one_padding_byte_and_keeps_the_same_value_in_plaintext() {
    let aes = Aes::new_128(&hex(KEY_128));
    let input = pdf_ciphertext(&[hex("c7c80bc82ca98d60ad992f01fb77b468")]);

    assert_eq!(aes.decrypt_pdf_cbc(&input).unwrap(), b"0123456789ABCD\x01");
}

#[test]
fn decrypts_a_full_padding_block_to_empty_plaintext() {
    let aes = Aes::new_128(&hex(KEY_128));
    let input = pdf_ciphertext(&[hex("e315209ed0e7c94f74a65c99f6eadc1e")]);

    assert!(aes.decrypt_pdf_cbc(&input).unwrap().is_empty());
}

#[test]
fn rejects_missing_or_incomplete_iv_and_iv_without_ciphertext() {
    let aes = Aes::new_128(&hex(KEY_128));
    let iv = hex::<16>(IV);

    for len in [0, 1, 15, 16] {
        assert_eq!(
            aes.decrypt_pdf_cbc(&iv[..len]),
            Err(AesCbcError::InvalidLength),
            "入力が {len} バイトの場合"
        );
    }
}

#[test]
fn rejects_a_partial_ciphertext_block_after_the_iv() {
    let aes = Aes::new_128(&hex(KEY_128));
    let input = pdf_ciphertext(&[
        hex("0f7108e8240171ebadaae9bf29a4fa21"),
        hex("efc6d88a11d76f86b901e934bbb2cd7e"),
    ]);

    for len in [17, 31, 33, 47] {
        assert_eq!(
            aes.decrypt_pdf_cbc(&input[..len]),
            Err(AesCbcError::InvalidLength),
            "入力が {len} バイトの場合"
        );
    }
}

#[test]
fn rejects_zero_and_mismatched_padding() {
    let aes = Aes::new_128(&hex(KEY_128));
    // OpenSSL の -nopad で、仕様に合わない末尾を持つ平文をそのまま暗号化した。
    let cases = [
        ("末尾が 00", "097fac153c4a60c65da846f2c62b7594"),
        ("末尾が 01 02", "29f3f44782f54428d32dcaf8321b118d"),
    ];

    for (reason, ciphertext) in cases {
        let input = pdf_ciphertext(&[hex(ciphertext)]);
        assert_eq!(
            aes.decrypt_pdf_cbc(&input),
            Err(AesCbcError::InvalidPadding),
            "{reason} の場合"
        );
    }
}

#[test]
fn rejects_a_full_final_block_claiming_seventeen_padding_bytes() {
    let aes = Aes::new_128(&hex(KEY_128));
    // 平文は 32 バイト、最終ブロックはすべて 0x11。末尾の一致や減算だけでは弾けない。
    let input = pdf_ciphertext(&[
        hex("0f7108e8240171ebadaae9bf29a4fa21"),
        hex("2402865661d1b8b69c7054849c76fcef"),
    ]);

    assert_eq!(
        aes.decrypt_pdf_cbc(&input),
        Err(AesCbcError::InvalidPadding)
    );
}
