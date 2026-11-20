use super::{replace_hex_entry, standard_handler, R5, R5_KEY};
use crate::encrypt::auth::{AuthError, PasswordRole};
use crate::encrypt::key::EncryptKey;
use crate::encrypt::EncryptDictionary;
use crate::file::header::PdfHeader;
use crate::object::pdf_object::PdfObject;
use crate::parser::Parser;
use crate::xref::{chain::XRefChain, entry::XRefEntry, trailer::EncryptValue};

#[test]
fn r5_authenticates_user_owner_and_rejects_wrong_or_empty_passwords() {
    let handler = standard_handler(R5.as_bytes());

    let user = handler
        .authenticate(Some(b"user-r5"), None)
        .expect("R5 の利用者パスワードで認証できる");
    assert_eq!(user.role(), PasswordRole::User);
    assert_eq!(user.as_bytes(), R5_KEY);
    assert!(user.key().as_aes256().is_some());
    assert!(user.key().as_legacy().is_none());

    let owner = handler
        .authenticate(Some(b"owner-r5"), None)
        .expect("R5 の所有者パスワードで認証できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), R5_KEY);

    for password in [None, Some(b"".as_slice()), Some(b"wrong".as_slice())] {
        assert_eq!(
            handler.authenticate(password, None).unwrap_err(),
            AuthError::IncorrectPassword
        );
    }
}

#[test]
fn r5_rejects_non_utf8_password_as_incorrect_password() {
    let handler = standard_handler(R5.as_bytes());
    assert_eq!(
        handler.authenticate(Some(b"\xff\xfe"), None).unwrap_err(),
        AuthError::IncorrectPassword
    );
    assert_eq!(
        handler
            .authenticate_as(PasswordRole::User, b"\x80", None)
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}

#[test]
fn r6_pdf_authenticates_with_omitted_empty_user_and_explicit_owner_password() {
    // qpdf --encrypt '' owner-r6 256 -- で生成した 1 ページ PDF。
    let pdf = include_bytes!("../../aes256_key/tests/r6-empty-user.pdf");
    let header = PdfHeader::parse(pdf).expect("PDF ヘッダを解析できる");
    let xref = XRefChain::parse(pdf, &header).expect("xref を解析できる");
    let Some(EncryptValue::Reference(reference)) = xref.trailer().encrypt() else {
        panic!("トレイラに /Encrypt の参照が必要");
    };
    let target = reference.target();
    let Some(XRefEntry::InUse { offset, .. }) = xref.table().get(target.object_number()) else {
        panic!("暗号化辞書の位置が必要");
    };
    let mut parser = Parser::new_at(pdf, usize::try_from(offset.value()).unwrap());
    let (id, object) = parser.parse_indirect_object().unwrap().into_parts();
    assert_eq!(id, target);
    let PdfObject::Dictionary(dictionary) = object else {
        panic!("参照先は辞書");
    };
    let encrypt = EncryptDictionary::from_dictionary(dictionary, *offset).unwrap();
    let handler = encrypt.as_standard().unwrap();
    let expected = b"\x15\x24\xac\x4e\x01\x2f\x0c\xde\xea\xe8\xae\x28\x5f\x65\xf9\x20\x2b\x06\x41\x0e\xdc\xb3\xea\x39\xb8\x0f\x77\xa0\xd3\xc4\x92\x20";

    // パスワード未指定・空指定はいずれも利用者として認証に成功する。
    for password in [None, Some(b"".as_slice())] {
        let user = handler
            .authenticate(password, xref.trailer().id())
            .expect("R6 の空利用者パスワードで認証できる");
        assert_eq!(user.role(), PasswordRole::User);
        assert_eq!(user.as_bytes(), expected);
    }

    // 所有者パスワードは所有者として認証に成功する（/ID なしでも可）。
    let owner = handler
        .authenticate(Some(b"owner-r6"), None)
        .expect("R6 の所有者パスワードで認証できる");
    assert_eq!(owner.role(), PasswordRole::Owner);
    assert_eq!(owner.as_bytes(), expected);

    // 誤パスワードと非 UTF-8 バイト列は認証失敗になる。
    for password in [Some(b"wrong".as_slice()), Some(b"\xff\xfe".as_slice())] {
        assert_eq!(
            handler.authenticate(password, None).unwrap_err(),
            AuthError::IncorrectPassword
        );
    }

    // authenticate_as で役割を限定すると他方のパスワードは通らない。
    assert_eq!(
        handler
            .authenticate_as(PasswordRole::Owner, b"", None)
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
    assert_eq!(
        handler
            .authenticate_as(PasswordRole::User, b"owner-r6", None)
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}

#[test]
fn r5_authenticate_truncates_utf8_at_byte_127_across_multibyte_char_boundary() {
    // 「界」の先頭 2 バイト（計 127 バイト）で生成した pypdf の /U と /UE。
    let dictionary = replace_hex_entry(
        R5,
        EncryptKey::U,
        "1a732e8fd657e5944aeb12cf9b1d7cf51e4cdc39cfd255a140f38dabf395ddf231323334353637386162636465666768",
    );
    let dictionary = replace_hex_entry(
        &dictionary,
        EncryptKey::UE,
        "f1118deb311faa1da160badfd5bcb5618903fad0e04e16ce4cd9c178e6745edf",
    );
    let handler = standard_handler(dictionary.as_bytes());
    let prefix = "a".repeat(125);

    for suffix in ["界", "界suffix"] {
        let password = format!("{prefix}{suffix}");
        let auth = handler
            .authenticate(Some(password.as_bytes()), None)
            .expect("127 バイト境界をまたぐ多バイト文字でもパニックせず認証できる");
        assert_eq!(auth.role(), PasswordRole::User);
        assert_eq!(auth.as_bytes(), R5_KEY);
    }

    assert_eq!(
        handler
            .authenticate(Some(prefix.as_bytes()), None)
            .unwrap_err(),
        AuthError::IncorrectPassword
    );
}
