use super::{TrailerError, TrailerErrorKind};
use crate::byte_offset::ByteOffset;
use crate::encrypt::error::{EncryptError, EncryptErrorKind};
use crate::encrypt::key::EncryptKey;
use crate::object::object_kind::ObjectKind;
use crate::parser::error::ParseErrorKind;
use crate::xref::trailer::key::TrailerKey;

// new が渡した kind と position を透過保持することを確認する
#[test]
fn new_constructs_with_given_kind_and_position() {
    let error = TrailerError::new(TrailerErrorKind::InvalidIdArray, ByteOffset::new(7));
    assert_eq!(error.kind, TrailerErrorKind::InvalidIdArray);
    assert_eq!(error.position, ByteOffset::new(7));
}

// 各 *_at コンストラクタが対応する kind を持ち、position を透過することを確認する
#[test]
fn convenience_constructors_set_expected_kind() {
    let position = ByteOffset::new(42);
    let cases: [(TrailerError, TrailerErrorKind); 8] = [
        (
            TrailerError::missing_trailer_keyword_at(position),
            TrailerErrorKind::MissingTrailerKeyword,
        ),
        (
            TrailerError::object_parse_failed_at(position, ParseErrorKind::UnexpectedEof),
            TrailerErrorKind::ObjectParseFailed {
                kind: ParseErrorKind::UnexpectedEof,
            },
        ),
        (
            TrailerError::not_a_dictionary_at(position, ObjectKind::Integer),
            TrailerErrorKind::NotADictionary {
                actual: ObjectKind::Integer,
            },
        ),
        (
            TrailerError::missing_required_key_at(position, TrailerKey::Size),
            TrailerErrorKind::MissingRequiredKey {
                key: TrailerKey::Size,
            },
        ),
        (
            TrailerError::invalid_key_type_at(position, TrailerKey::Root, ObjectKind::Integer),
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Root,
                actual: ObjectKind::Integer,
            },
        ),
        (
            TrailerError::negative_value_at(position, TrailerKey::Prev),
            TrailerErrorKind::NegativeValue {
                key: TrailerKey::Prev,
            },
        ),
        (
            TrailerError::key_value_out_of_range_at(position, TrailerKey::Prev, i64::MAX),
            TrailerErrorKind::KeyValueOutOfRange {
                key: TrailerKey::Prev,
                value: i64::MAX,
            },
        ),
        (
            TrailerError::invalid_id_array_at(position),
            TrailerErrorKind::InvalidIdArray,
        ),
    ];
    for (error, expected_kind) in cases {
        assert_eq!(error.kind, expected_kind, "kind: {expected_kind:?}");
        assert_eq!(error.position, position, "position: {expected_kind:?}");
    }
}

// position の境界値（0 と u64::MAX）がそのまま保持されることを確認する
#[test]
fn position_boundary_values_are_preserved() {
    assert_eq!(
        TrailerError::invalid_id_array_at(ByteOffset::new(0)).position,
        ByteOffset::new(0)
    );
    assert_eq!(
        TrailerError::invalid_id_array_at(ByteOffset::new(u64::MAX)).position,
        ByteOffset::new(u64::MAX)
    );
}

// 同じ kind・position なら等価、kind か position が違えば非等価であることを確認する
#[test]
fn equality_follows_kind_and_position() {
    let position = ByteOffset::new(10);
    let a = TrailerError::invalid_key_type_at(position, TrailerKey::Size, ObjectKind::Real);
    let b = TrailerError::invalid_key_type_at(position, TrailerKey::Size, ObjectKind::Real);
    let different_key =
        TrailerError::invalid_key_type_at(position, TrailerKey::Prev, ObjectKind::Real);
    let different_actual =
        TrailerError::invalid_key_type_at(position, TrailerKey::Size, ObjectKind::Name);
    let different_position =
        TrailerError::invalid_key_type_at(ByteOffset::new(11), TrailerKey::Size, ObjectKind::Real);
    assert_eq!(a, b);
    assert_ne!(a, different_key);
    assert_ne!(a, different_actual);
    assert_ne!(a, different_position);
}

// encrypt_dictionary_invalid が委譲先エラーの kind と position をそのまま引き継ぐことを確認する
#[test]
fn encrypt_dictionary_invalid_inherits_position_from_delegated_error() {
    let error = EncryptError::missing_required_key_at(ByteOffset::new(37), EncryptKey::Filter);

    let trailer_error = TrailerError::encrypt_dictionary_invalid(error);

    assert_eq!(
        trailer_error.kind,
        TrailerErrorKind::EncryptDictionaryInvalid {
            kind: EncryptErrorKind::MissingRequiredKey {
                key: EncryptKey::Filter,
            },
        }
    );
    assert_eq!(trailer_error.position, ByteOffset::new(37));
}

// KeyValueOutOfRange が型不一致（InvalidKeyType）・負値（NegativeValue）と別バリアントであることを確認する
#[test]
fn key_value_out_of_range_is_distinct_from_type_and_negative_errors() {
    let position = ByteOffset::new(5);
    let out_of_range =
        TrailerError::key_value_out_of_range_at(position, TrailerKey::Size, i64::MAX);
    let wrong_type =
        TrailerError::invalid_key_type_at(position, TrailerKey::Size, ObjectKind::Integer);
    let negative = TrailerError::negative_value_at(position, TrailerKey::Size);

    assert_ne!(out_of_range, wrong_type);
    assert_ne!(out_of_range, negative);
}

// key_value_out_of_range_at が key と value を透過保持することを確認する
#[test]
fn key_value_out_of_range_at_preserves_key_and_value() {
    let error =
        TrailerError::key_value_out_of_range_at(ByteOffset::new(9), TrailerKey::XRefStm, i64::MAX);

    assert_eq!(
        error.kind,
        TrailerErrorKind::KeyValueOutOfRange {
            key: TrailerKey::XRefStm,
            value: i64::MAX,
        }
    );
    assert_eq!(error.position, ByteOffset::new(9));
}
