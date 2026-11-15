use super::hex;
use crate::encrypt::aes::{Aes, BLOCK_LEN};

const IV: &str = "000102030405060708090a0b0c0d0e0f";
const PLAINTEXT: &str = concat!(
    "6bc1bee22e409f96e93d7e117393172a",
    "ae2d8a571e03ac9c9eb76fac45af8e51",
    "30c81c46a35ce411e5fbc1191a0a52ef",
    "f69f2445df4f9b17ad2b417be66c3710",
);

#[test]
fn decrypts_nist_cbc_aes128_vector() {
    // NIST SP 800-38A F.2.2。パディングなしの 4 ブロック。
    let aes = Aes::new_128(&hex("2b7e151628aed2a6abf7158809cf4f3c"));
    let ciphertext = hex::<64>(concat!(
        "7649abac8119b246cee98e9b12e9197d",
        "5086cb9b507219ee95db113a917678b2",
        "73bed6b8e3c1743b7116e69e22229516",
        "3ff1caa1681fac09120eca307586e1a7",
    ));
    let (blocks, _) = ciphertext.as_chunks::<BLOCK_LEN>();

    assert_eq!(
        aes.decrypt_cbc_blocks(&hex(IV), blocks),
        hex::<64>(PLAINTEXT)
    );
}

#[test]
fn decrypts_nist_cbc_aes256_vector() {
    // NIST SP 800-38A F.2.6。AES-128 と同じ平文と IV を使う。
    let aes = Aes::new_256(&hex(
        "603deb1015ca71be2b73aef0857d77811f352c073b6108d72d9810a30914dff4",
    ));
    let ciphertext = hex::<64>(concat!(
        "f58c4c04d6e5f1ba779eabfb5f7bfbd6",
        "9cfc4e967edb808d679f777bc6702c7d",
        "39f23369a9d9bacfa530e26304231461",
        "b2eb05e2c39be9fcda6c19078c6a9d1b",
    ));
    let (blocks, _) = ciphertext.as_chunks::<BLOCK_LEN>();

    assert_eq!(
        aes.decrypt_cbc_blocks(&hex(IV), blocks),
        hex::<64>(PLAINTEXT)
    );
}
