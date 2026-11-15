use super::vectors::{
    R2, R2_KEY, R3, R3_KEY, R3_PASSWORD, R4_CLEAR_METADATA, R4_CLEAR_METADATA_KEY,
};
use super::{parse_trailer, TRAILER};
use crate::encrypt::legacy_key::LegacyFileKeyError;
use crate::encrypt::tests::encrypt;

#[test]
fn unsigned_permissions_give_the_same_key_as_signed_permissions() {
    let unsigned = R4_CLEAR_METADATA.replace("/P -3392", "/P 4294963904");
    let encryption = encrypt(unsigned.as_bytes());
    let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
    let trailer = parse_trailer(TRAILER);
    let key = handler
        .derive_legacy_file_key(b"user", trailer.id())
        .expect("符号なし表記でも鍵を導出できる");

    assert_eq!(key.as_bytes(), R4_CLEAR_METADATA_KEY);
}

#[test]
fn derives_the_same_key_when_only_the_changing_id_is_replaced() {
    let encryption = encrypt(R2.as_bytes());
    let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
    let trailer = parse_trailer(
        b"trailer << /Root 1 0 R /Size 6 /Encrypt 5 0 R
            /ID [<31415926535897932384626433832795> (updated)] >>",
    );
    let key = handler
        .derive_legacy_file_key(b"", trailer.id())
        .expect("更新後のトレイラでも鍵を導出できる");

    assert_eq!(key.as_bytes(), R2_KEY);
}

#[test]
fn reports_a_missing_file_id_at_derivation() {
    let encryption = encrypt(R2.as_bytes());
    let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
    let trailer = parse_trailer(b"trailer << /Root 1 0 R /Size 6 /Encrypt 5 0 R >>");
    let error = handler
        .derive_legacy_file_key(b"", trailer.id())
        .expect_err("/ID が欠けていると鍵は導出できない");

    assert_eq!(error, LegacyFileKeyError::MissingFileId);
}

#[test]
fn accepts_a_present_file_id_with_an_empty_permanent_entry() {
    let encryption = encrypt(R2.as_bytes());
    let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
    let trailer = parse_trailer(b"trailer << /Root 1 0 R /Size 6 /Encrypt 5 0 R /ID [<> ()] >>");
    let key = handler
        .derive_legacy_file_key(b"", trailer.id())
        .expect("空の永続 ID で鍵を導出できる");

    // 永続 ID が空の場合の鍵は pypdf AlgV4 で確認した。
    assert_eq!(key.as_bytes(), b"\xc1\xdc\xdc\xa0\x2b");
}

#[test]
fn truncates_the_password_after_32_bytes() {
    let encryption = encrypt(R3);
    let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
    let trailer = parse_trailer(TRAILER);
    let long_password = [R3_PASSWORD.as_slice(), b"\x00\xffextra"].concat();
    let key = handler
        .derive_legacy_file_key(&long_password, trailer.id())
        .expect("32 バイト超の入力でも鍵を導出できる");

    assert_eq!(key.as_bytes(), R3_KEY);
}

#[test]
fn reports_short_and_long_owner_entries_at_derivation() {
    let trailer = parse_trailer(TRAILER);
    for actual in [31, 33] {
        let dictionary = format!(
            "<< /Filter /Standard /V 1 /R 2 /P -4 /O <{}> /U () >>",
            "00".repeat(actual)
        );
        let encryption = encrypt(dictionary.as_bytes());
        let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
        let error = handler
            .derive_legacy_file_key(b"", trailer.id())
            .expect_err("/O が 32 バイト以外では鍵を導出できない");

        assert_eq!(
            error,
            LegacyFileKeyError::InvalidOwnerEntryLength { actual }
        );
    }
}

#[test]
fn reports_r5_and_r6_as_outside_algorithm_2() {
    let trailer = parse_trailer(TRAILER);
    for revision in [5, 6] {
        let dictionary = format!(
            "<< /Filter /Standard /V 5 /R {revision} /P -4 /CF << >>
                /O () /U () /OE () /UE () /Perms () >>"
        );
        let encryption = encrypt(dictionary.as_bytes());
        let handler = encryption.as_standard().expect("標準ハンドラを取得できる");
        let error = handler
            .derive_legacy_file_key(b"", trailer.id())
            .expect_err("R5 と R6 は別のアルゴリズムを使う");

        assert_eq!(error, LegacyFileKeyError::UnsupportedRevision);
    }
}
