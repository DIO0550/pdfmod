use super::{
    parse_trailer, replace_hex_entry, standard_handler, R2, R2_KEY, R4_CLEAR_METADATA,
    R4_CLEAR_METADATA_KEY, R5, TRAILER,
};
use crate::encrypt::auth::{AuthError, PasswordRole};
use crate::encrypt::key::EncryptKey;

#[test]
fn legacy_reports_missing_file_id_separately_from_incorrect_password() {
    for source in [R2, R4_CLEAR_METADATA] {
        let handler = standard_handler(source.as_bytes());
        assert_eq!(
            handler.authenticate(None, None).unwrap_err(),
            AuthError::MissingFileId
        );
        assert_eq!(
            handler.authenticate(Some(b"owner"), None).unwrap_err(),
            AuthError::MissingFileId
        );
    }
}

#[test]
fn legacy_reports_invalid_o_and_u_lengths_separately_from_incorrect_password() {
    let trailer = parse_trailer(TRAILER);

    for source in [R2, R4_CLEAR_METADATA] {
        for key in [EncryptKey::O, EncryptKey::U] {
            for actual in [0, 16, 31, 33] {
                let broken = replace_hex_entry(source, key, &"00".repeat(actual));
                let handler = standard_handler(broken.as_bytes());
                assert_eq!(
                    handler.authenticate(None, trailer.id()).unwrap_err(),
                    AuthError::InvalidEntryLength { key, actual },
                    "key={key:?}, actual={actual}"
                );
                assert_eq!(
                    handler
                        .authenticate(Some(b"owner"), trailer.id())
                        .unwrap_err(),
                    AuthError::InvalidEntryLength { key, actual },
                    "key={key:?}, actual={actual}"
                );
            }
        }
    }
}

#[test]
fn r2_verifies_all_32_bytes_of_u_while_r4_ignores_trailing_16_bytes() {
    let trailer = parse_trailer(TRAILER);

    // R2: /U の末尾 1 バイトだけを変えると認証失敗になる（全 32 バイト比較）。
    let r2_changed = R2.replace("d8b51d0a>", "d8b51d0b>");
    assert_eq!(
        standard_handler(r2_changed.as_bytes())
            .authenticate(None, trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
    let r2_handler = standard_handler(R2.as_bytes());
    let r2_ok = r2_handler.authenticate(None, trailer.id()).unwrap();
    assert_eq!(r2_ok.as_bytes(), R2_KEY);

    // R4: /U の後半 16 バイト（16..32）を変えても認証成功する（先頭 16 バイト比較）。
    let r4_changed_tail = R4_CLEAR_METADATA.replace(
        "0122456a91bae5134273a6db134c87c4>",
        "ffffffffffffffffffffffffffffffff>",
    );
    let r4_handler = standard_handler(r4_changed_tail.as_bytes());
    let r4_ok = r4_handler
        .authenticate(Some(b"user"), trailer.id())
        .expect("R4 は /U の後半 16 バイトを無視する");
    assert_eq!(r4_ok.role(), PasswordRole::User);
    assert_eq!(r4_ok.as_bytes(), R4_CLEAR_METADATA_KEY);

    // R4: /U の先頭 16 バイト内の 1 バイトを変えると認証失敗になる。
    let r4_changed_head = R4_CLEAR_METADATA.replace(
        "3250600e32dc6a8eae7dc501b5ba8e52",
        "3250600e32dc6a8eae7dc501b5ba8e53",
    );
    assert_eq!(
        standard_handler(r4_changed_head.as_bytes())
            .authenticate(Some(b"user"), trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}

#[test]
fn r5_reports_entry_length_and_perms_corruption_separately_from_incorrect_password() {
    for (key, expected) in [
        (EncryptKey::U, 48),
        (EncryptKey::O, 48),
        (EncryptKey::UE, 32),
        (EncryptKey::OE, 32),
        (EncryptKey::Perms, 16),
    ] {
        for actual in [expected - 1, expected + 1] {
            let broken = replace_hex_entry(R5, key, &"00".repeat(actual));
            let handler = standard_handler(broken.as_bytes());
            assert_eq!(
                handler.authenticate(None, None).unwrap_err(),
                AuthError::InvalidEntryLength { key, actual },
                "key={key:?}, actual={actual}"
            );
            // 非 UTF-8 パスワードでも辞書の長さ不正が IncorrectPassword に隠されないこと。
            assert_eq!(
                handler.authenticate(Some(b"\xff\xfe"), None).unwrap_err(),
                AuthError::InvalidEntryLength { key, actual },
                "non-UTF-8 authenticate: key={key:?}, actual={actual}"
            );
        }
    }

    // authenticate_as でも役割ごとの必須項目長が UTF-8 判定より先に検証されること。
    for (role, key, expected) in [
        (PasswordRole::User, EncryptKey::U, 48),
        (PasswordRole::User, EncryptKey::UE, 32),
        (PasswordRole::User, EncryptKey::Perms, 16),
        (PasswordRole::Owner, EncryptKey::U, 48),
        (PasswordRole::Owner, EncryptKey::O, 48),
        (PasswordRole::Owner, EncryptKey::OE, 32),
        (PasswordRole::Owner, EncryptKey::Perms, 16),
    ] {
        for actual in [expected - 1, expected + 1] {
            let broken = replace_hex_entry(R5, key, &"00".repeat(actual));
            let handler = standard_handler(broken.as_bytes());
            assert_eq!(
                handler
                    .authenticate_as(role, b"\xff\xfe", None)
                    .unwrap_err(),
                AuthError::InvalidEntryLength { key, actual },
                "non-UTF-8 authenticate_as: role={role:?}, key={key:?}, actual={actual}"
            );
        }
    }

    // パスワード一致後に /Perms 検証が失敗した場合、IncorrectPassword ではなく InvalidPermissions を返す。
    for tampered in [
        R5.replace("/P -2056", "/P -4"),
        R5.replace("/EncryptMetadata false", "/EncryptMetadata true"),
        replace_hex_entry(R5, EncryptKey::Perms, "0d12c1913d02751b18b15f21c1ba32b3"),
        replace_hex_entry(R5, EncryptKey::UE, &"00".repeat(32)),
    ] {
        let handler = standard_handler(tampered.as_bytes());
        assert_eq!(
            handler.authenticate(Some(b"user-r5"), None).unwrap_err(),
            AuthError::InvalidPermissions
        );
    }

    // 所有者認証でも /Perms 改ざんは利用者認証へフォールバックせず即座に InvalidPermissions を返す。
    let tampered_perms = R5.replace("/P -2056", "/P -4");
    assert_eq!(
        standard_handler(tampered_perms.as_bytes())
            .authenticate(Some(b"owner-r5"), None)
            .unwrap_err(),
        AuthError::InvalidPermissions
    );
}
