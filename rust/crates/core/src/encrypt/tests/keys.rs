use super::{encrypt, encrypt_err};
use crate::encrypt::error::EncryptErrorKind;
use crate::encrypt::key::{EncryptKey, EncryptKeyPath};
use crate::encrypt::standard::StandardSecurityHandler;
use crate::encrypt::EncryptDictionary;
use crate::object::object_kind::ObjectKind;

/// `/O` `/U` に書く 32 バイトの値（R2-4 の仕様上の長さ）。
const KEY_32_BYTES: &[u8] = b"0123456789abcdef0123456789abcdef";

/// `/V 1` `/R 2` の暗号化辞書のソース文字列を組み立てる。
fn source(keys: &str) -> Vec<u8> {
    format!("<< /Filter /Standard /V 1 /R 2 {keys} >>").into_bytes()
}

/// `/O` `/U` `/P` を持つ最小構成に追加キーを足したソース文字列を組み立てる。
fn source_with_required_keys(extra: &str) -> Vec<u8> {
    source(&format!(
        "/O (0123456789abcdef0123456789abcdef) \
         /U (0123456789abcdef0123456789abcdef) /P -1 {extra}"
    ))
}

/// 標準セキュリティハンドラを取り出す。
fn handler(source: &[u8]) -> StandardSecurityHandler {
    let EncryptDictionary::Standard(handler) = encrypt(source) else {
        panic!("expected the standard security handler");
    };
    handler
}

// /O /U がバイト列として保持されることを確認する
#[test]
fn owner_and_user_keys_are_kept_as_bytes() {
    let handler = handler(&source_with_required_keys(""));

    assert_eq!(handler.owner_key(), KEY_32_BYTES);
    assert_eq!(handler.user_key(), KEY_32_BYTES);
}

// 仕様外の長さの /O でも長さ検証をせず保持することを確認する
#[test]
fn owner_key_with_non_specified_length_is_kept() {
    let handler = handler(&source(
        "/O (12345678) /U (0123456789abcdef0123456789abcdef) /P -1",
    ));

    assert_eq!(handler.owner_key(), b"12345678");
}

// /P が符号付きのビットパターンとして保持されることを確認する
#[test]
fn permissions_keep_the_signed_bit_pattern() {
    let handler = handler(&source(
        "/O (0123456789abcdef0123456789abcdef) \
         /U (0123456789abcdef0123456789abcdef) /P -3904",
    ));

    assert_eq!(handler.permissions().bits(), -3904);
    assert!(!handler.permissions().print());
}

// 符号なし表記で書かれた /P が同じビットパターンになることを確認する
#[test]
fn permissions_accept_unsigned_notation() {
    let handler = handler(&source(
        "/O (0123456789abcdef0123456789abcdef) \
         /U (0123456789abcdef0123456789abcdef) /P 4294967292",
    ));

    assert_eq!(handler.permissions().bits(), -4);
}

// /EncryptMetadata の既定値と明示指定が反映されることを確認する
#[test]
fn encrypt_metadata_defaults_to_true() {
    let cases: [(&str, bool); 3] = [
        ("", true),
        ("/EncryptMetadata true", true),
        ("/EncryptMetadata false", false),
    ];
    for (extra, expected) in cases {
        let handler = handler(&source_with_required_keys(extra));

        assert_eq!(handler.encrypt_metadata(), expected, "extra: {extra}");
    }
}

// 未知のキーが無視されて解析が成功することを確認する
#[test]
fn unknown_keys_are_ignored() {
    let handler = handler(&source_with_required_keys("/Foo 1 /Bar << /Baz (x) >>"));

    assert_eq!(handler.owner_key(), KEY_32_BYTES);
}

// 必須キーの欠落が MissingRequiredKey になることを確認する
#[test]
fn missing_required_keys_are_rejected() {
    let cases: [(&str, EncryptKey); 3] = [
        ("/U (0123456789abcdef0123456789abcdef) /P -1", EncryptKey::O),
        ("/O (0123456789abcdef0123456789abcdef) /P -1", EncryptKey::U),
        (
            "/O (0123456789abcdef0123456789abcdef) \
             /U (0123456789abcdef0123456789abcdef)",
            EncryptKey::P,
        ),
    ];
    for (keys, missing) in cases {
        let error = encrypt_err(&source(keys));

        assert_eq!(
            error.kind(),
            &EncryptErrorKind::MissingRequiredKey { key: missing },
            "keys: {keys}"
        );
    }
}

// /O が文字列でない場合に InvalidKeyType になることを確認する
#[test]
fn non_string_owner_key_is_rejected() {
    let error = encrypt_err(&source(
        "/O /NotAString /U (0123456789abcdef0123456789abcdef) /P -1",
    ));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::Root(EncryptKey::O),
            actual: ObjectKind::Name,
        }
    );
}

// 32 ビットに収まらない /P が InvalidPermissions になることを確認する
#[test]
fn permissions_beyond_32_bits_are_rejected() {
    let error = encrypt_err(&source(
        "/O (0123456789abcdef0123456789abcdef) \
         /U (0123456789abcdef0123456789abcdef) /P 9223372036854775807",
    ));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidPermissions { value: i64::MAX }
    );
}

// /EncryptMetadata が真偽値でない場合に InvalidKeyType になることを確認する
#[test]
fn non_boolean_encrypt_metadata_is_rejected() {
    let error = encrypt_err(&source_with_required_keys("/EncryptMetadata 0"));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::Root(EncryptKey::EncryptMetadata),
            actual: ObjectKind::Integer,
        }
    );
}
