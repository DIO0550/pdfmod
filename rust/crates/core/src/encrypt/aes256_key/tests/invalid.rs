use super::{derive, replace_hex_entry, R5, R5_KEY};
use crate::encrypt::aes256_key::{Aes256FileKeyError, PasswordRole};
use crate::encrypt::key::EncryptKey;

#[test]
fn wrong_passwords_and_the_other_roles_password_fail_validation() {
    for (role, password) in [
        (PasswordRole::User, ""),
        (PasswordRole::Owner, "user-r5"),
        (PasswordRole::User, "owner-r5"),
    ] {
        assert_eq!(
            derive(R5, role, password).unwrap_err(),
            Aes256FileKeyError::IncorrectPassword
        );
    }
}

#[test]
fn owner_validation_binds_all_48_user_bytes() {
    // /U の最後の 1 バイトだけを変更する。所有者の検証にもこのバイトが必要。
    let changed = R5.replace("711700af>", "711700ae>");
    assert_eq!(
        derive(&changed, PasswordRole::Owner, "owner-r5").unwrap_err(),
        Aes256FileKeyError::IncorrectPassword
    );
}

#[test]
fn checks_short_and_long_entries_before_hashing() {
    for (role, key, expected) in [
        (PasswordRole::User, EncryptKey::U, 48),
        (PasswordRole::Owner, EncryptKey::U, 48),
        (PasswordRole::Owner, EncryptKey::O, 48),
        (PasswordRole::User, EncryptKey::UE, 32),
        (PasswordRole::Owner, EncryptKey::OE, 32),
        (PasswordRole::User, EncryptKey::Perms, 16),
    ] {
        for actual in [expected - 1, expected + 1] {
            let changed = replace_hex_entry(R5, key, &"00".repeat(actual));
            assert_eq!(
                derive(&changed, role, "").unwrap_err(),
                Aes256FileKeyError::InvalidEntryLength { key, actual }
            );
        }
    }
}

#[test]
fn legacy_revisions_use_a_separate_key_algorithm() {
    let legacy = "<< /Filter /Standard /V 1 /R 2 /P -4 /O () /U () >>";
    assert_eq!(
        derive(legacy, PasswordRole::User, "").unwrap_err(),
        Aes256FileKeyError::UnsupportedRevision
    );
}

#[test]
fn rejects_mismatched_permissions_metadata_reserved_bytes_and_marker() {
    // 権限ブロックの予約領域または adb だけを変え、既知の鍵で個別に再暗号化した。
    for changed in [
        R5.replace("/P -2056", "/P -4"),
        R5.replace("/EncryptMetadata false", "/EncryptMetadata true"),
        replace_hex_entry(R5, EncryptKey::Perms, "0d12c1913d02751b18b15f21c1ba32b3"),
        replace_hex_entry(R5, EncryptKey::Perms, "32e60d2fa5f460d1c24e88afc93b05ae"),
        replace_hex_entry(R5, EncryptKey::UE, &"00".repeat(32)),
    ] {
        assert_eq!(
            derive(&changed, PasswordRole::User, "user-r5").unwrap_err(),
            Aes256FileKeyError::InvalidPermissions
        );
    }
}

#[test]
fn accepts_arbitrary_random_tail_of_permissions() {
    let changed = replace_hex_entry(R5, EncryptKey::Perms, "0adb76072eadb8c96f0afd0b8d95f636");
    let key = derive(&changed, PasswordRole::User, "user-r5").unwrap();
    assert_eq!(key.as_bytes(), R5_KEY);
}
