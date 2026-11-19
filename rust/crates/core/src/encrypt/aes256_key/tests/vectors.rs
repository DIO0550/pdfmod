use super::{derive, replace_hex_entry, R5, R5_KEY};
use crate::encrypt::aes256_key::{hash::Revision, Aes256FileKeyError, PasswordRole};
use crate::encrypt::key::EncryptKey;
use crate::encrypt::EncryptDictionary;
use crate::file::header::PdfHeader;
use crate::object::pdf_object::PdfObject;
use crate::parser::Parser;
use crate::xref::{chain::XRefChain, entry::XRefEntry, trailer::EncryptValue};

#[test]
fn both_r5_passwords_recover_the_qpdf_file_key() {
    for (role, password) in [
        (PasswordRole::User, "user-r5"),
        (PasswordRole::Owner, "owner-r5"),
    ] {
        let key = derive(R5, role, password).unwrap();
        assert_eq!(key.as_bytes(), R5_KEY);
    }
}

#[test]
fn r6_pdf_recovers_the_qpdf_key_with_empty_user_or_nonempty_owner_password() {
    // qpdf --encrypt '' owner-r6 256 -- で作った 1 ページ PDF。
    // 期待する鍵は --show-encryption-key で取得し、pypdf でも照合した。
    let pdf = include_bytes!("r6-empty-user.pdf");
    let header = PdfHeader::parse(pdf).unwrap();
    let xref = XRefChain::parse(pdf, &header).unwrap();
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
    for (role, password) in [(PasswordRole::User, ""), (PasswordRole::Owner, "owner-r6")] {
        let key = handler.derive_aes256_file_key(role, password).unwrap();
        assert_eq!(key.as_bytes(), expected);
    }
    assert_eq!(
        handler
            .derive_aes256_file_key(PasswordRole::Owner, "")
            .unwrap_err(),
        Aes256FileKeyError::IncorrectPassword
    );
}

#[test]
fn r6_can_stop_on_round_64_when_the_last_encrypted_byte_is_32() {
    // このソルトでは 64 ラウンド目の末尾が 0x20。pypdf AlgV5 の固定値。
    let result = Revision::R6.hash(b"", &30_u64.to_be_bytes(), b"").unwrap();
    let expected = b"\x22\x06\xfe\x56\x7c\xec\xbc\xaf\x9a\x58\x8c\x71\x2b\x18\x3b\x0a\x3b\xc4\x26\x87\x9c\xef\x3a\x7a\xdd\x50\xec\x4e\xfd\x2c\xe2\xd4";
    assert_eq!(&result, expected);
}

#[test]
fn truncates_prepared_utf8_at_byte_127_inside_a_character() {
    // 「界」の先頭 2 バイトまでを使った pypdf の /U と /UE。
    let dictionary = replace_hex_entry(R5, EncryptKey::U,
        "1a732e8fd657e5944aeb12cf9b1d7cf51e4cdc39cfd255a140f38dabf395ddf231323334353637386162636465666768");
    let dictionary = replace_hex_entry(
        &dictionary,
        EncryptKey::UE,
        "f1118deb311faa1da160badfd5bcb5618903fad0e04e16ce4cd9c178e6745edf",
    );
    let prefix = "a".repeat(125);
    for suffix in ["界", "界suffix"] {
        let key = derive(
            &dictionary,
            PasswordRole::User,
            &format!("{prefix}{suffix}"),
        )
        .unwrap();
        assert_eq!(key.as_bytes(), R5_KEY);
    }
    assert_eq!(
        derive(&dictionary, PasswordRole::User, &prefix).unwrap_err(),
        Aes256FileKeyError::IncorrectPassword
    );
}
