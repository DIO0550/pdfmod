use super::indirect;
use crate::encrypt::auth::tests::{parse_trailer, standard_handler, R2, R5, TRAILER};
use crate::encrypt::object_key::{EncryptedValueKind, ObjectDecryption};

#[test]
fn legacy_rc4_uses_object_and_generation_and_truncates_to_ten_bytes() {
    let handler = standard_handler(R2.as_bytes());
    let trailer = parse_trailer(TRAILER);
    let auth = handler.authenticate(None, trailer.id()).unwrap();

    // 既知の R2 ファイル鍵に番号をリトルエンディアンで連結し、Python の hashlib で照合した。
    for (number, generation, expected) in [
        (7, 0x1234, b"\xf1\x2f\xa0\xa4\x93\xe0\x98\x62\xb8\x9f"),
        (8, 0x1234, b"\xac\x0b\xec\xab\xa7\xe5\x74\x66\x52\x21"),
        (7, 0x1235, b"\x78\x93\xd9\x0c\x35\x7a\x5d\x7f\xaa\x6d"),
    ] {
        let target = indirect(number, generation, EncryptedValueKind::String);
        let ObjectDecryption::Rc4(key) = auth.object_decryption(target).unwrap() else {
            panic!("V1 の文字列には RC4 の鍵が必要");
        };
        assert_eq!(key.as_bytes(), expected);
    }
}

#[test]
fn algorithm_one_uses_only_the_low_three_object_number_bytes() {
    let handler = standard_handler(R2.as_bytes());
    let trailer = parse_trailer(TRAILER);
    let auth = handler.authenticate(None, trailer.id()).unwrap();

    // 0xff_ffff は 3 バイトの上限。0x100_0000 の下位 3 バイトは 00 00 00。
    for (number, generation, expected) in [
        (
            0xff_ffff,
            0xffff,
            b"\x42\x30\xf5\x89\xe6\xb9\x12\x90\x8f\xad",
        ),
        (
            0x100_0000,
            0xffff,
            b"\x92\x2d\x06\x64\x3c\x7b\x68\x91\x6d\xb8",
        ),
        (
            0xab_cdef,
            0x1234,
            b"\xf6\x64\x60\x5f\x8d\x58\x8d\xe7\xb2\x13",
        ),
        (
            0x1ab_cdef,
            0x1234,
            b"\xf6\x64\x60\x5f\x8d\x58\x8d\xe7\xb2\x13",
        ),
    ] {
        let target = indirect(number, generation, EncryptedValueKind::Stream);
        let ObjectDecryption::Rc4(key) = auth.object_decryption(target).unwrap() else {
            panic!("V1 のストリームには RC4 の鍵が必要");
        };
        assert_eq!(key.as_bytes(), expected);
    }
}

#[test]
fn aesv3_returns_file_key_bytes_that_outlive_authentication() {
    let (decryptions, file_key_bytes) = {
        let handler = standard_handler(R5.as_bytes());
        let auth = handler.authenticate(Some(b"user-r5"), None).unwrap();
        let file_key_bytes = *auth.key().as_aes256().unwrap().as_bytes();
        let targets = [
            indirect(7, 0, EncryptedValueKind::String),
            indirect(0x100_0000, 8, EncryptedValueKind::Stream),
        ];
        let decryptions = targets.map(|target| auth.object_decryption(target).unwrap());
        (decryptions, file_key_bytes)
    };

    for decryption in decryptions {
        let ObjectDecryption::Aes256(key) = decryption else {
            panic!("AESV3 の場合はファイル暗号鍵を使う");
        };
        assert_eq!(key.as_bytes(), &file_key_bytes);
    }
}
