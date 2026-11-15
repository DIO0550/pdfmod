use super::{hex, KEY_128, KEY_256};
use crate::encrypt::aes::Aes;

#[test]
fn decrypts_fips_197_aes128_block() {
    // FIPS 197 Appendix C.1。
    let aes = Aes::new_128(&hex(KEY_128));
    let ciphertext = hex("69c4e0d86a7b0430d8cdb78070b4c55a");

    assert_eq!(
        aes.decrypt_ecb_block(&ciphertext),
        hex("00112233445566778899aabbccddeeff")
    );
}

#[test]
fn decrypts_fips_197_aes256_block() {
    // FIPS 197 Appendix C.3。
    let aes = Aes::new_256(&hex(KEY_256));
    let ciphertext = hex("8ea2b7ca516745bfeafc49904b496089");

    assert_eq!(
        aes.decrypt_ecb_block(&ciphertext),
        hex("00112233445566778899aabbccddeeff")
    );
}

#[test]
fn decrypts_all_sixteen_bytes_of_pdf_permissions() {
    // /P -4、メタデータ暗号化ありの権限ブロックを OpenSSL の AES-256-ECB で暗号化した。
    let aes = Aes::new_256(&hex(KEY_256));
    let ciphertext = hex("d2ffe8bc214ebc01dff5af20c2b755c8");

    assert_eq!(
        aes.decrypt_ecb_block(&ciphertext),
        hex("fcffffffffffffff5461646200010203")
    );
}
