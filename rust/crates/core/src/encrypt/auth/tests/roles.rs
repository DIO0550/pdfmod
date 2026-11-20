use super::{parse_trailer, replace_hex_entry, standard_handler, R2, R2_KEY, R5, R5_KEY, TRAILER};
use crate::encrypt::auth::{FileEncryptionKey, PasswordRole};
use crate::encrypt::key::EncryptKey;

#[test]
fn omitted_password_tries_user_before_owner_when_both_passwords_are_empty() {
    let trailer = parse_trailer(TRAILER);

    // R2: user = "", owner = ""
    let r2_both_empty = b"<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
        /O <2055c756c72e1ad702608e8196acad447ad32d17cff583235f6dd15fed7dab67>
        /U <660de68a4d103b65851a73d833e1c41ccf14a3a7679b6be9a79f2e6883848a79> >>";
    let r2_key = b"\x42\x25\x19\x55\x22";
    let r2_handler = standard_handler(r2_both_empty);

    let omitted = r2_handler
        .authenticate(None, trailer.id())
        .expect("未指定時は空パスワードで利用者認証を優先する");
    assert_eq!(omitted.role(), PasswordRole::User);
    assert_eq!(omitted.as_bytes(), r2_key);

    // 明示的に Some(b"") を渡した場合は所有者 → 利用者の順なので所有者になる。
    let explicit = r2_handler
        .authenticate(Some(b""), trailer.id())
        .expect("明示指定時は所有者認証を優先する");
    assert_eq!(explicit.role(), PasswordRole::Owner);
    assert_eq!(explicit.as_bytes(), r2_key);

    // R3: user = "", owner = ""
    let r3_both_empty = b"<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4
        /O <36451bd39d753b7c1d10922c28e6665aa4f3353fb0348b536893e3b1db5c579b>
        /U <5685a7cf1b36901995a01342155b383b0122456a91bae5134273a6db134c87c4> >>";
    let r3_key = b"\xd2\x2c\x20\x22\xea\x99\x0b\xa5\x3d\x12\x6c\xcc\xf2\xc9\x9d\xbe";
    let r3_handler = standard_handler(r3_both_empty);
    let r3_omitted = r3_handler.authenticate(None, trailer.id()).unwrap();
    assert_eq!(r3_omitted.role(), PasswordRole::User);
    assert_eq!(r3_omitted.as_bytes(), r3_key);
    let r3_explicit = r3_handler.authenticate(Some(b""), trailer.id()).unwrap();
    assert_eq!(r3_explicit.role(), PasswordRole::Owner);
    assert_eq!(r3_explicit.as_bytes(), r3_key);

    // R5: user = "", owner = ""
    let r5_both_empty = replace_hex_entry(
        R5,
        EncryptKey::U,
        "4f9f10b304cfe9b2b11fcb1387f694e18f08ea358c7e9f567434d3ad6cbd7fc431313232333334343535363637373838",
    );
    let r5_both_empty = replace_hex_entry(
        &r5_both_empty,
        EncryptKey::UE,
        "f2c5dbfe66b1c2041db44edb63aeebe4a58ae2b8a77d3e2885264e6df7723c23",
    );
    let r5_both_empty = replace_hex_entry(
        &r5_both_empty,
        EncryptKey::O,
        "562fdaf74fa397fadf504b5e0f9f38921c85d50c704eb5b0177ec844c8bfed0561616262636364646565666630303131",
    );
    let r5_both_empty = replace_hex_entry(
        &r5_both_empty,
        EncryptKey::OE,
        "0ab35254635a71389d4579f005852f9119043086ed63bc258023939049473a02",
    );
    let r5_handler = standard_handler(r5_both_empty.as_bytes());
    let r5_omitted = r5_handler.authenticate(None, None).unwrap();
    assert_eq!(r5_omitted.role(), PasswordRole::User);
    assert_eq!(r5_omitted.as_bytes(), R5_KEY);
    let r5_explicit = r5_handler.authenticate(Some(b""), None).unwrap();
    assert_eq!(r5_explicit.role(), PasswordRole::Owner);
    assert_eq!(r5_explicit.as_bytes(), R5_KEY);
}

#[test]
fn omitted_password_falls_back_to_owner_when_only_owner_password_is_empty() {
    let trailer = parse_trailer(TRAILER);

    // R2: user = "user-r2", owner = ""
    let r2 = b"<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
        /O <7d99ec7aa429a2bed92e9e991cdced2854b37b5ee59cb58d5e61ce71e1104232>
        /U <9a6616008ba2405122133611da82ffb5880134c18bbe55314619f2e1e4e8f473> >>";
    let r2_key = b"\x16\x0b\xf9\x5e\x49";
    let r2_handler = standard_handler(r2);
    let r2_auth = r2_handler
        .authenticate(None, trailer.id())
        .expect("R2 で空利用者失敗後に空所有者へフォールバックできる");
    assert_eq!(r2_auth.role(), PasswordRole::Owner);
    assert_eq!(r2_auth.as_bytes(), r2_key);

    // R3: user = "user-r3", owner = ""
    let r3 = b"<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4
        /O <6b8930fffe728215c65e8234a29626368a9363769a5dbdfd699ffc9fd731bece>
        /U <d291347f1647eddc6da444e29dcedb420122456a91bae5134273a6db134c87c4> >>";
    let r3_key = b"\x21\xe8\xf8\x26\x35\x8f\xb9\xcd\x66\x32\x00\x02\x6c\xc1\xc4\x59";
    let r3_handler = standard_handler(r3);
    let r3_auth = r3_handler
        .authenticate(None, trailer.id())
        .expect("R3 で空利用者失敗後に空所有者へフォールバックできる");
    assert_eq!(r3_auth.role(), PasswordRole::Owner);
    assert_eq!(r3_auth.as_bytes(), r3_key);

    // R5: user = "user-r5", owner = ""
    let r5_owner_empty = replace_hex_entry(
        R5,
        EncryptKey::O,
        "7557811eff8393cdf9143ec5f448f2d2cb9a8b90c18974050adeac45f9c0700238373635343332316867666564636261",
    );
    let r5_owner_empty = replace_hex_entry(
        &r5_owner_empty,
        EncryptKey::OE,
        "ed63e74ff6dcfe3838799223bb5ac52189c1fc62cf5182dd2a23efeb9fa0e658",
    );
    let r5_handler = standard_handler(r5_owner_empty.as_bytes());
    let r5_auth = r5_handler
        .authenticate(None, None)
        .expect("R5 で空利用者失敗後に空所有者へフォールバックできる");
    assert_eq!(r5_auth.role(), PasswordRole::Owner);
    assert_eq!(r5_auth.as_bytes(), R5_KEY);
}

#[test]
fn explicit_password_prefers_owner_when_user_and_owner_passwords_are_identical() {
    let trailer = parse_trailer(TRAILER);

    // R2: user == owner == "shared"
    let r2 = b"<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
        /O <8bcfe6441d8d2931a4bd1c063a0fc2e5d165288c9f429d491a513414f7bde5aa>
        /U <b000bee02ac13b53a5f940094057180e67da785b31a7bc6a27297ec4e7f3586f> >>";
    let r2_auth = standard_handler(r2)
        .authenticate(Some(b"shared"), trailer.id())
        .unwrap();
    assert_eq!(r2_auth.role(), PasswordRole::Owner);
    assert_eq!(r2_auth.as_bytes(), b"\xef\xe9\x3c\xf9\xcb");

    // R3: user == owner == "shared-r3"
    let r3 = b"<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4
        /O <ef4e52c82a492f3fd5ad90ce3846b738c11b7b2c38d8cfe236062aee2bc9b9c4>
        /U <ba7e586784910f76a068f5cb7a410eff0122456a91bae5134273a6db134c87c4> >>";
    let r3_auth = standard_handler(r3)
        .authenticate(Some(b"shared-r3"), trailer.id())
        .unwrap();
    assert_eq!(r3_auth.role(), PasswordRole::Owner);
    assert_eq!(
        r3_auth.as_bytes(),
        b"\x82\xc0\xdd\xa6\x2f\xe4\xd2\x50\xae\x94\xde\x2f\x4c\x19\x85\x74"
    );

    // R4: user == owner == "shared-r4" (EncryptMetadata false)
    let r4 = b"<< /Filter /Standard /V 4 /R 4 /Length 128
        /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >>
        /StmF /StdCF /StrF /StdCF /P -3392 /EncryptMetadata false
        /O <d558d15c2e5630be588eb5627040b710633ad0e89268920bc6b9668d87d1e241>
        /U <b24e6231b6927bde60f5edd622fc575c0122456a91bae5134273a6db134c87c4> >>";
    let r4_auth = standard_handler(r4)
        .authenticate(Some(b"shared-r4"), trailer.id())
        .unwrap();
    assert_eq!(r4_auth.role(), PasswordRole::Owner);
    assert_eq!(
        r4_auth.as_bytes(),
        b"\xbc\x80\x2d\xfe\xf6\xbf\x9a\x1c\xa3\x8f\x96\xa6\x38\xef\x82\x85"
    );

    // R5: user == owner == "user-r5"
    let r5_same = replace_hex_entry(
        R5,
        EncryptKey::O,
        "f3bc0e010f9ad99651c5a6709d13223ea0ab63668cea26d0fe21ee91d3f60c8131323334353637386162636465666768",
    );
    let r5_same = replace_hex_entry(
        &r5_same,
        EncryptKey::OE,
        "1806262c5ddd8229a4ed71fa1b222b39a3fc402f47b66e779d561acaf234042a",
    );
    let r5_auth = standard_handler(r5_same.as_bytes())
        .authenticate(Some(b"user-r5"), None)
        .unwrap();
    assert_eq!(r5_auth.role(), PasswordRole::Owner);
    assert_eq!(r5_auth.as_bytes(), R5_KEY);
}

#[test]
fn authenticated_file_key_accessors_and_redacted_debug_do_not_leak_key_bytes() {
    let trailer = parse_trailer(TRAILER);

    let legacy_auth = standard_handler(R2.as_bytes())
        .authenticate(None, trailer.id())
        .unwrap();
    assert!(matches!(legacy_auth.key(), FileEncryptionKey::Legacy(_)));
    assert_eq!(legacy_auth.key().as_legacy().unwrap().as_bytes(), R2_KEY);
    assert!(legacy_auth.key().as_aes256().is_none());

    for legacy_debug in [format!("{legacy_auth:?}"), format!("{legacy_auth:#?}")] {
        assert!(legacy_debug.contains("AuthenticatedFileKey"));
        assert!(legacy_debug.contains("User"));
        assert!(legacy_debug.contains("LegacyFileKey"));
        // R2_KEY = [0x0e, 0x7b, 0x66, 0x93, 0x8a] = [14, 123, 102, 147, 138]
        for leaked in ["123", "147", "138", "7b", "93", "8a"] {
            assert!(
                !legacy_debug.contains(leaked),
                "Debug 出力に鍵バイトが含まれてはいけない: {legacy_debug}"
            );
        }
    }

    let aes_auth = standard_handler(R5.as_bytes())
        .authenticate(Some(b"owner-r5"), None)
        .unwrap();
    assert!(matches!(aes_auth.key(), FileEncryptionKey::Aes256(_)));
    assert_eq!(aes_auth.key().as_aes256().unwrap().as_bytes(), R5_KEY);
    assert!(aes_auth.key().as_legacy().is_none());

    for aes_debug in [format!("{aes_auth:?}"), format!("{aes_auth:#?}")] {
        assert!(aes_debug.contains("AuthenticatedFileKey"));
        assert!(aes_debug.contains("Owner"));
        assert!(aes_debug.contains("Aes256FileKey"));
        // R5_KEY の代表値（0x45 = 69, 0xc0 = 192, 0xbf = 191, 0xc7 = 199）が出力されないこと。
        for leaked in ["192", "191", "199", "457a", "9cc7"] {
            assert!(
                !aes_debug.contains(leaked),
                "Debug 出力に鍵バイトが含まれてはいけない: {aes_debug}"
            );
        }
    }
}
