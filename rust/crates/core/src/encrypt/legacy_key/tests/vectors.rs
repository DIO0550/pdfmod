use super::{parse_trailer, TRAILER};
use crate::encrypt::algorithm::StandardAlgorithm;
use crate::encrypt::legacy_key::PASSWORD_PADDING;
use crate::encrypt::md5::Md5;
use crate::encrypt::rc4::Rc4;
use crate::encrypt::tests::encrypt;

// qpdf 12.2.0 の --encrypt と --show-encryption-key で確認した辞書と鍵。
pub(super) const R2: &str = "<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
    /O <c92422687facee686e373f10b5c7d04738053152f7e2ee30e11c69ec442576ab>
    /U <b3d9fa366906ef42f354c6deb74c59075eaf334eb7c04356ba0d7f3dd8b51d0a> >>";
pub(super) const R2_KEY: &[u8] = b"\x0e\x7b\x66\x93\x8a";
pub(super) const R3: &[u8] = b"<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4
    /O <4ee1d41e94737be19102bf7b4641e524b372b64683f2beaff9f83a4acd0dbaf9>
    /U <3af1a0bcf5545dc6dae3e61e4dbc40e10122456a91bae5134273a6db134c87c4> >>";
pub(super) const R3_PASSWORD: &[u8; 32] = b"0123456789abcdefghijklmnopqrstuv";
pub(super) const R3_KEY: &[u8] =
    b"\xfc\xe7\xf5\xa9\x51\x37\xc4\x76\xe4\xd0\x1a\x99\x19\xd2\x6e\x6c";
pub(super) const R4_CLEAR_METADATA: &str = "<< /Filter /Standard /V 4 /R 4 /Length 128
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >>
    /StmF /StdCF /StrF /StdCF /P -3392 /EncryptMetadata false
    /O <0ba3835f88f90388e74e54584125ce142be0de24c6b0d37746e075b891756671>
    /U <3250600e32dc6a8eae7dc501b5ba8e520122456a91bae5134273a6db134c87c4> >>";
pub(super) const R4_CLEAR_METADATA_KEY: &[u8] =
    b"\x2d\x36\x57\xbf\x2e\xed\x39\xf7\x1c\x70\x04\x23\x87\x7a\x4e\x15";

#[test]
fn r2_uses_five_bytes_and_matches_all_of_u_for_an_empty_password() {
    assert_key_and_user_entry(R2.as_bytes(), b"", R2_KEY);

    let ignored_length = R2.replace("/Length 40", "/Length 128");
    assert_key_and_user_entry(ignored_length.as_bytes(), b"", R2_KEY);
}

#[test]
fn r3_matches_u_for_a_128_bit_key() {
    assert_key_and_user_entry(R3, R3_PASSWORD, R3_KEY);
}

#[test]
fn r3_rehashes_only_the_eight_key_bytes_for_length_64() {
    // pypdf AlgV4 で求めた /O、/U、鍵を使い、16 バイト全体を再ハッシュすると検出する。
    let dictionary = b"<< /Filter /Standard /V 2 /R 3 /Length 64 /P -4
        /O <808b6846e0e99aee3b4dec725c7deb74982fc6c0b56891fc8add0a28ba8cdfe2>
        /U <6a5ab84c371817650499ca0001d73d7228bf4e5e4e758a4164004e56fffa0108> >>";

    assert_key_and_user_entry(dictionary, b"user", b"\xb6\x33\xf3\x0b\x9f\xfd\x9d\x54");
}

#[test]
fn r3_uses_five_bytes_for_v1_and_when_v2_omits_length() {
    // pypdf AlgV4 で求めた /O、/U、鍵。両方とも R3 の 50 回反復が必要。
    let v1 = "<< /Filter /Standard /V 1 /R 3 /P -4 /EncryptMetadata false
        /O <3c482162008fafcb228b7db3c43a1090bc5b56e9b1556e89fc0656fd291f4908>
        /U <d3b1553015c7d57ed4c8a35b0f084ee928bf4e5e4e758a4164004e56fffa0108> >>";
    let v2 = v1.replace("/V 1", "/V 2");
    let expected = b"\x01\x85\x6e\x76\xcd";

    assert_key_and_user_entry(v1.as_bytes(), b"user", expected);
    assert_key_and_user_entry(v2.as_bytes(), b"user", expected);
}

#[test]
fn r4_matches_u_when_metadata_is_clear() {
    assert_key_and_user_entry(R4_CLEAR_METADATA.as_bytes(), b"user", R4_CLEAR_METADATA_KEY);
}

#[test]
fn r4_matches_u_when_metadata_is_encrypted_by_default() {
    let dictionary = R4_CLEAR_METADATA
        .replace(" /EncryptMetadata false", "")
        .replace(
            "3250600e32dc6a8eae7dc501b5ba8e52",
            "e250eb5d8e3c3f343517acaccb13a1bb",
        );
    let expected = b"\x08\x7e\xdb\xc7\x0b\x1e\x23\x18\x0c\xdb\xf4\x85\xf8\x2f\x3a\xb3";

    assert_key_and_user_entry(dictionary.as_bytes(), b"user", expected);
}

fn assert_key_and_user_entry(dictionary: &[u8], password: &[u8], expected_key: &[u8]) {
    let encryption = encrypt(dictionary);
    let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
    let trailer = parse_trailer(TRAILER);
    let id = trailer.id().expect("トレイラから /ID を取得できる");
    let key = handler
        .derive_legacy_file_key(password, Some(id))
        .expect("鍵を導出できる");
    assert_eq!(key.as_bytes(), expected_key);

    // Algorithm 4 は標準パディングを暗号化し、/U の全 32 バイトと比較する。
    if matches!(handler.algorithm(), StandardAlgorithm::V1R2) {
        let mut user_entry = PASSWORD_PADDING;
        Rc4::new(key.as_bytes())
            .expect("R2 の RC4 鍵")
            .apply(&mut user_entry);
        assert_eq!(&user_entry, handler.user_key());
        return;
    }

    // Algorithm 5 は MD5 を入力に 20 回 RC4 を適用し、/U の先頭 16 バイトと比較する。
    let mut md5 = Md5::new();
    md5.update(&PASSWORD_PADDING);
    md5.update(id.permanent());
    let mut user_entry_prefix = md5.finalize();
    for round in 0..20_u8 {
        let round_key: Vec<u8> = key.as_bytes().iter().map(|byte| byte ^ round).collect();
        Rc4::new(&round_key)
            .expect("R3/R4 の RC4 鍵")
            .apply(&mut user_entry_prefix);
    }
    assert_eq!(&user_entry_prefix, &handler.user_key()[..16]);
}
