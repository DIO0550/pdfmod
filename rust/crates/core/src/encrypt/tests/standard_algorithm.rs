use super::{encrypt, encrypt_err};
use crate::encrypt::algorithm::{KeyLength, StandardAlgorithm};
use crate::encrypt::error::EncryptErrorKind;
use crate::encrypt::key::{EncryptKey, EncryptKeyPath};
use crate::encrypt::EncryptDictionary;

/// `/O` `/U` に書く 32 バイトの値（R2-4 の仕様上の長さ）。
const KEY_32_BYTES: &str = "(0123456789abcdef0123456789abcdef)";

/// 標準ハンドラの必須キー（`/O` `/U` `/P`）だけを含む断片。
fn required_keys() -> String {
    format!("/O {KEY_32_BYTES} /U {KEY_32_BYTES} /P -1")
}

/// `/V` `/R` と追加キーから暗号化辞書のソース文字列を組み立てる。
fn source(version: i64, revision: i64, extra: &str) -> Vec<u8> {
    format!(
        "<< /Filter /Standard /V {version} /R {revision} {extra} {} >>",
        required_keys()
    )
    .into_bytes()
}

/// アルゴリズムだけを取り出す（Standard として解釈できることを前提とする）。
fn algorithm(source: &[u8]) -> StandardAlgorithm {
    let EncryptDictionary::Standard(handler) = encrypt(source) else {
        panic!("expected the standard security handler");
    };
    handler.algorithm().clone()
}

// /V 1 /R 2 の最小構成が V1R2 になり、鍵長が 40 ビット固定になることを確認する
#[test]
fn v1_r2_minimal_dictionary_is_typed_as_v1r2() {
    let algorithm = algorithm(&source(1, 2, ""));

    assert_eq!(algorithm, StandardAlgorithm::V1R2);
    assert_eq!(algorithm.key_length(), KeyLength::BITS_40);
}

// /V 1 /R 3 が V1R3 になることを確認する
#[test]
fn v1_r3_dictionary_is_typed_as_v1r3() {
    let algorithm = algorithm(&source(1, 3, ""));

    assert_eq!(algorithm, StandardAlgorithm::V1R3);
    assert_eq!(algorithm.key_length(), KeyLength::BITS_40);
}

// /V 2 /R 3 /Length 128 が V2R3 になり、鍵長を保持することを確認する
#[test]
fn v2_r3_dictionary_keeps_specified_key_length() {
    let algorithm = algorithm(&source(2, 3, "/Length 128"));

    let StandardAlgorithm::V2R3 { key_length } = algorithm else {
        panic!("expected the /V 2 /R 3 combination");
    };
    assert_eq!(key_length.bits(), 128);
}

// /Length を省略した /V 2 /R 3 が既定の 40 ビットになることを確認する
#[test]
fn v2_r3_dictionary_defaults_to_40_bit_key_length() {
    let algorithm = algorithm(&source(2, 3, ""));

    assert_eq!(
        algorithm,
        StandardAlgorithm::V2R3 {
            key_length: KeyLength::BITS_40
        }
    );
}

// 仕様の範囲内の /Length（下限・8 の倍数・上限）が受理されることを確認する
#[test]
fn v2_r3_accepts_key_lengths_within_specification() {
    let cases: [u16; 3] = [40, 48, 128];
    for bits in cases {
        let algorithm = algorithm(&source(2, 3, &format!("/Length {bits}")));

        assert_eq!(algorithm.key_length().bits(), bits, "/Length {bits}");
    }
}

// 仕様外の /Length が InvalidKeyLength になることを確認する
#[test]
fn v2_r3_rejects_key_lengths_outside_specification() {
    let cases: [i64; 4] = [32, 44, 132, -8];
    for bits in cases {
        let error = encrypt_err(&source(2, 3, &format!("/Length {bits}")));

        assert_eq!(
            error.kind(),
            &EncryptErrorKind::InvalidKeyLength { value: bits },
            "/Length {bits}"
        );
    }
}

// /V 4 /R 4 が crypt filter と /Length の両方を保持することを確認する
#[test]
fn v4_r4_dictionary_keeps_key_length_and_crypt_filters() {
    let algorithm = algorithm(&source(
        4,
        4,
        "/Length 128 /CF << /StdCF << /CFM /AESV2 /Length 16 >> >> /StmF /StdCF /StrF /StdCF",
    ));

    let StandardAlgorithm::V4R4 {
        key_length,
        crypt_filters,
    } = algorithm
    else {
        panic!("expected the /V 4 /R 4 combination");
    };
    assert_eq!(key_length.bits(), 128);
    assert_eq!(crypt_filters.len(), 1);
}

// /V 5 /R 5 と /V 5 /R 6 が /OE /UE /Perms を保持し、鍵長が 256 ビットになることを確認する
#[test]
fn v5_dictionaries_keep_aes_key_material() {
    let aes_keys = "/CF << /StdCF << /CFM /AESV3 >> >> /StmF /StdCF /StrF /StdCF \
                    /OE (owner-encrypted) /UE (user-encrypted) /Perms (perms-copy)";
    let cases: [(i64, bool); 2] = [(5, true), (6, false)];
    for (revision, expects_r5) in cases {
        let algorithm = algorithm(&source(5, revision, aes_keys));

        let (StandardAlgorithm::V5R5 { keys, .. } | StandardAlgorithm::V5R6 { keys, .. }) =
            &algorithm
        else {
            panic!("expected a /V 5 combination for /R {revision}");
        };
        assert_eq!(keys.owner_encrypted_key, b"owner-encrypted");
        assert_eq!(keys.user_encrypted_key, b"user-encrypted");
        assert_eq!(keys.perms, b"perms-copy");
        assert_eq!(algorithm.key_length(), KeyLength::BITS_256);
        assert_eq!(
            matches!(algorithm, StandardAlgorithm::V5R5 { .. }),
            expects_r5,
            "/R {revision}"
        );
    }
}

// /R 5 /R 6 の必須キーが欠けていると MissingRequiredKey になることを確認する
#[test]
fn v5_dictionary_without_aes_key_material_is_rejected() {
    let cases: [(&str, EncryptKey); 3] = [
        ("/UE (user-encrypted) /Perms (perms-copy)", EncryptKey::OE),
        ("/OE (owner-encrypted) /Perms (perms-copy)", EncryptKey::UE),
        (
            "/OE (owner-encrypted) /UE (user-encrypted)",
            EncryptKey::Perms,
        ),
    ];
    for (keys, missing) in cases {
        let extra = format!("/CF << /StdCF << /CFM /AESV3 >> >> {keys}");
        let error = encrypt_err(&source(5, 6, &extra));

        assert_eq!(
            error.kind(),
            &EncryptErrorKind::MissingRequiredKey { key: missing },
            "keys: {keys}"
        );
    }
}

// /V /R が欠けている Standard 辞書が MissingRequiredKey になることを確認する
#[test]
fn standard_dictionary_without_version_or_revision_is_rejected() {
    let cases: [(&str, EncryptKey); 2] = [("/R 2", EncryptKey::V), ("/V 1", EncryptKey::R)];
    for (present, missing) in cases {
        let source = format!("<< /Filter /Standard {present} {} >>", required_keys()).into_bytes();
        let error = encrypt_err(&source);

        assert_eq!(
            error.kind(),
            &EncryptErrorKind::MissingRequiredKey { key: missing },
            "present: {present}"
        );
    }
}

// /V の型が整数でない場合に InvalidKeyType になることを確認する
#[test]
fn standard_dictionary_with_non_integer_version_is_rejected() {
    let source = format!("<< /Filter /Standard /V /Four /R 2 {} >>", required_keys()).into_bytes();

    let error = encrypt_err(&source);

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::Root(EncryptKey::V),
            actual_kind: "Name",
        }
    );
}
