use super::{
    parse_trailer, standard_handler, R2, R2_KEY, R3, R3_KEY, R3_USER_PASSWORD, R4_CLEAR_METADATA,
    R4_CLEAR_METADATA_KEY, TRAILER,
};
use crate::encrypt::auth::{AuthError, PasswordRole};

#[test]
fn r2_authenticates_empty_user_and_owner_passwords() {
    let handler = standard_handler(R2.as_bytes());
    let trailer = parse_trailer(TRAILER);

    for password in [None, Some(b"".as_slice())] {
        let auth = handler
            .authenticate(password, trailer.id())
            .expect("R2 の空利用者パスワードで認証できる");
        assert_eq!(auth.role(), PasswordRole::User);
        assert_eq!(auth.as_bytes(), R2_KEY);
    }

    let owner = handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("R2 の所有者パスワードで認証できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), R2_KEY);

    assert_eq!(
        handler
            .authenticate(Some(b"wrong"), trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}

#[test]
fn r2_ignores_length_entry_and_uses_five_byte_owner_and_file_keys() {
    let ignored_length = R2.replace("/Length 40", "/Length 128");
    let handler = standard_handler(ignored_length.as_bytes());
    let trailer = parse_trailer(TRAILER);

    let user = handler
        .authenticate(None, trailer.id())
        .expect("R2 は /Length を無視して 40 ビット鍵で認証できる");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), R2_KEY);

    let owner = handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("R2 の Algorithm 7 も 5 バイト鍵で /O を復号できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), R2_KEY);
}

#[test]
fn r3_authenticates_32_byte_user_password_and_recovers_it_via_owner_password() {
    let handler = standard_handler(R3.as_bytes());
    let trailer = parse_trailer(TRAILER);

    // 32 バイトちょうどの利用者パスワードと、それを超える入力（切り詰め）。
    let long_user = [R3_USER_PASSWORD.as_slice(), b"\x00\xffextra"].concat();
    for password in [R3_USER_PASSWORD.as_slice(), long_user.as_slice()] {
        let user = handler
            .authenticate(Some(password), trailer.id())
            .expect("R3 の利用者パスワードで認証できる");
        assert_eq!(user.role(), PasswordRole::User);
        assert_eq!(user.as_bytes(), R3_KEY);
    }

    // Algorithm 7 が /O から 32 バイトの利用者パスワードをそのまま復元して検証する。
    let owner = handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("R3 の所有者パスワードで 32 バイトの利用者パスワードを復元できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), R3_KEY);

    assert_eq!(
        handler.authenticate(None, trailer.id()).unwrap_err(),
        AuthError::IncorrectPassword
    );
    assert_eq!(
        handler
            .authenticate(Some(b"wrong"), trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}

#[test]
fn r3_64_bit_rehashes_all_16_bytes_for_owner_key_and_8_bytes_for_file_key() {
    // pypdf AlgV4 で求めた /O・/U・鍵（user = "user", owner = "owner", Length = 64）。
    // Algorithm 3 手順 3 で 16 バイト全体（8 バイトではなく）を 50 回再ハッシュしないと一致しない。
    let dictionary = b"<< /Filter /Standard /V 2 /R 3 /Length 64 /P -4
        /O <808b6846e0e99aee3b4dec725c7deb74982fc6c0b56891fc8add0a28ba8cdfe2>
        /U <6a5ab84c371817650499ca0001d73d7228bf4e5e4e758a4164004e56fffa0108> >>";
    let handler = standard_handler(dictionary);
    let trailer = parse_trailer(TRAILER);
    let expected = b"\xb6\x33\xf3\x0b\x9f\xfd\x9d\x54";

    let user = handler
        .authenticate(Some(b"user"), trailer.id())
        .expect("64 ビット R3 の利用者認証");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), expected);

    let owner = handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("64 ビット R3 の所有者認証");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), expected);
}

#[test]
fn v1r3_and_v2r3_without_length_use_20_round_rc4_and_50_round_md5() {
    let v1 = "<< /Filter /Standard /V 1 /R 3 /P -4 /EncryptMetadata false
        /O <3c482162008fafcb228b7db3c43a1090bc5b56e9b1556e89fc0656fd291f4908>
        /U <d3b1553015c7d57ed4c8a35b0f084ee928bf4e5e4e758a4164004e56fffa0108> >>";
    let v2 = v1.replace("/V 1", "/V 2");
    let expected = b"\x01\x85\x6e\x76\xcd";
    let trailer = parse_trailer(TRAILER);

    for source in [v1, v2.as_str()] {
        let handler = standard_handler(source.as_bytes());
        let user = handler
            .authenticate(Some(b"user"), trailer.id())
            .expect("V1R3 / V2R3 既定長で利用者認証できる");
        assert_eq!(user.role(), PasswordRole::User);
        assert_eq!(user.as_bytes(), expected);

        let owner = handler
            .authenticate(Some(b"owner"), trailer.id())
            .expect("V1R3 / V2R3 既定長で所有者認証できる");
        assert_eq!(owner.role(), PasswordRole::Owner);
        assert_eq!(owner.as_bytes(), expected);
    }
}

#[test]
fn r4_authenticates_user_and_owner_with_clear_and_encrypted_metadata() {
    let trailer = parse_trailer(TRAILER);

    let clear_handler = standard_handler(R4_CLEAR_METADATA.as_bytes());
    let clear_user = clear_handler
        .authenticate(Some(b"user"), trailer.id())
        .expect("R4 非暗号化メタデータの利用者認証");
    assert_eq!(clear_user.role(), PasswordRole::User);
    assert_eq!(clear_user.as_bytes(), R4_CLEAR_METADATA_KEY);

    let clear_owner = clear_handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("R4 非暗号化メタデータの所有者認証");
    assert_eq!(clear_owner.role(), PasswordRole::Owner);
    assert_eq!(clear_owner.as_bytes(), R4_CLEAR_METADATA_KEY);

    let encrypted_dict = R4_CLEAR_METADATA
        .replace(" /EncryptMetadata false", "")
        .replace(
            "3250600e32dc6a8eae7dc501b5ba8e52",
            "e250eb5d8e3c3f343517acaccb13a1bb",
        );
    let encrypted_expected = b"\x08\x7e\xdb\xc7\x0b\x1e\x23\x18\x0c\xdb\xf4\x85\xf8\x2f\x3a\xb3";
    let encrypted_handler = standard_handler(encrypted_dict.as_bytes());

    let enc_user = encrypted_handler
        .authenticate(Some(b"user"), trailer.id())
        .expect("R4 暗号化メタデータの利用者認証");
    assert_eq!(enc_user.role(), PasswordRole::User);
    assert_eq!(enc_user.as_bytes(), encrypted_expected);

    let enc_owner = encrypted_handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("R4 暗号化メタデータの所有者認証");
    assert_eq!(enc_owner.role(), PasswordRole::Owner);
    assert_eq!(enc_owner.as_bytes(), encrypted_expected);
}

#[test]
fn r4_with_v2_rc4_crypt_filter_authenticates_user_and_owner() {
    let trailer = parse_trailer(TRAILER);
    let v2_dict = R4_CLEAR_METADATA.replace("/CFM /AESV2", "/CFM /V2");
    let handler = standard_handler(v2_dict.as_bytes());

    let user = handler
        .authenticate(Some(b"user"), trailer.id())
        .expect("V4R4 /CFM /V2 の利用者認証");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), R4_CLEAR_METADATA_KEY);

    let owner = handler
        .authenticate(Some(b"owner"), trailer.id())
        .expect("V4R4 /CFM /V2 の所有者認証");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), R4_CLEAR_METADATA_KEY);

    assert_eq!(
        handler
            .authenticate(Some(b"wrong"), trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}

#[test]
fn legacy_accepts_non_utf8_raw_password_bytes() {
    let trailer = parse_trailer(TRAILER);

    // R2: user = b"\x80\xffuser", owner = b"\xfe\x81owner"
    let r2 = b"<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
        /O <8a4294d401b3c88c9ca764e0f3d9c8a8925aedd7003b7a74f21df323ad58e63f>
        /U <487eb01a12b4ec48f44ae365c42fd89654236382bcd75c2c382f07ebc2f793d9> >>";
    let r2_key = b"\x97\xb7\x80\x70\xa9";
    let r2_handler = standard_handler(r2);

    let user = r2_handler
        .authenticate(Some(b"\x80\xffuser"), trailer.id())
        .expect("R2 で非 UTF-8 バイト列の利用者パスワードを認証できる");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), r2_key);

    let owner = r2_handler
        .authenticate(Some(b"\xfe\x81owner"), trailer.id())
        .expect("R2 で非 UTF-8 バイト列の所有者パスワードを認証できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), r2_key);

    // R4: user = b"\x80\xffr4", owner = b"\xfe\x81r4"
    let r4 = b"<< /Filter /Standard /V 4 /R 4 /Length 128
        /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >>
        /StmF /StdCF /StrF /StdCF /P -3392
        /O <51a8b9e661f9fa707bad0ec7343ecb2bcfd107cfa1e3cf350bbf7bb6b172fd53>
        /U <3639a474cb662a8b6aabddee0d6dab6c0122456a91bae5134273a6db134c87c4> >>";
    let r4_key = b"\x41\xac\xe2\xbf\xc2\x5c\x67\xd9\xc3\x35\x99\x1b\x55\x3d\x56\xda";
    let r4_handler = standard_handler(r4);

    let user = r4_handler
        .authenticate(Some(b"\x80\xffr4"), trailer.id())
        .expect("R4 で非 UTF-8 バイト列の利用者パスワードを認証できる");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), r4_key);

    let owner = r4_handler
        .authenticate(Some(b"\xfe\x81r4"), trailer.id())
        .expect("R4 で非 UTF-8 バイト列の所有者パスワードを認証できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), r4_key);
}

#[test]
fn authenticate_as_isolates_algorithm_6_and_algorithm_7() {
    let handler = standard_handler(R4_CLEAR_METADATA.as_bytes());
    let trailer = parse_trailer(TRAILER);

    assert_eq!(
        handler
            .authenticate_as(PasswordRole::User, b"owner", trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
    assert_eq!(
        handler
            .authenticate_as(PasswordRole::Owner, b"user", trailer.id())
            .unwrap_err(),
        AuthError::IncorrectPassword
    );

    let user = handler
        .authenticate_as(PasswordRole::User, b"user", trailer.id())
        .expect("Algorithm 6 単体で認証できる");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), R4_CLEAR_METADATA_KEY);

    let owner = handler
        .authenticate_as(PasswordRole::Owner, b"owner", trailer.id())
        .expect("Algorithm 7 単体で認証できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), R4_CLEAR_METADATA_KEY);
}
