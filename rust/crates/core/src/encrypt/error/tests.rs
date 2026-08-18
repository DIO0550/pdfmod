use super::{EncryptError, EncryptErrorKind};
use crate::byte_offset::ByteOffset;
use crate::encrypt::key::EncryptKey;
use crate::object::name::PdfName;

// new が渡した kind と position を透過保持することを確認する
#[test]
fn new_constructs_with_given_kind_and_position() {
    let error = EncryptError::new(EncryptErrorKind::MissingCryptFilters, ByteOffset::new(7));
    assert_eq!(error.kind(), &EncryptErrorKind::MissingCryptFilters);
    assert_eq!(error.position(), ByteOffset::new(7));
}

// 各 *_at コンストラクタが対応する kind を持ち、position を透過することを確認する
#[test]
fn convenience_constructors_set_expected_kind() {
    let position = ByteOffset::new(42);
    let cases: [(EncryptError, EncryptErrorKind); 7] = [
        (
            EncryptError::missing_required_key_at(position, EncryptKey::Filter),
            EncryptErrorKind::MissingRequiredKey {
                key: EncryptKey::Filter,
            },
        ),
        (
            EncryptError::invalid_key_type_at(position, EncryptKey::V, "Name"),
            EncryptErrorKind::InvalidKeyType {
                key: EncryptKey::V,
                actual_kind: "Name",
            },
        ),
        (
            EncryptError::invalid_key_length_at(position, 132),
            EncryptErrorKind::InvalidKeyLength { value: 132 },
        ),
        (
            EncryptError::missing_crypt_filters_at(position),
            EncryptErrorKind::MissingCryptFilters,
        ),
        (
            EncryptError::undefined_crypt_filter_at(
                position,
                EncryptKey::StmF,
                PdfName::from("NoSuchFilter"),
            ),
            EncryptErrorKind::UndefinedCryptFilter {
                key: EncryptKey::StmF,
                name: PdfName::from("NoSuchFilter"),
            },
        ),
        (
            EncryptError::unknown_crypt_filter_method_at(position, PdfName::from("AESV9")),
            EncryptErrorKind::UnknownCryptFilterMethod {
                name: PdfName::from("AESV9"),
            },
        ),
        (
            EncryptError::invalid_permissions_at(position, i64::MAX),
            EncryptErrorKind::InvalidPermissions { value: i64::MAX },
        ),
    ];
    for (error, expected_kind) in cases {
        assert_eq!(error.kind(), &expected_kind, "kind: {expected_kind:?}");
        assert_eq!(error.position(), position, "kind: {expected_kind:?}");
    }
}

// into_kind が種別を所有権ごと取り出せることを確認する
#[test]
fn into_kind_yields_the_original_kind() {
    let error = EncryptError::missing_required_key_at(ByteOffset::new(1), EncryptKey::OE);

    assert_eq!(
        error.into_kind(),
        EncryptErrorKind::MissingRequiredKey {
            key: EncryptKey::OE
        }
    );
}
