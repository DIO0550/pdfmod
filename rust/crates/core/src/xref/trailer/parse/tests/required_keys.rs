use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_id::ObjectId;
use crate::object::object_kind::ObjectKind;
use crate::object::object_number::ObjectNumber;
use crate::xref::trailer::error::TrailerErrorKind;
use crate::xref::trailer::key::TrailerKey;

// 最小構成のトレイラから /Size と /Root が取れ、任意キーがすべて None になることを確認する
#[test]
fn minimal_trailer_yields_size_and_root() {
    let input = simple_trailer("/Size 6 /Root 1 0 R");
    let parsed =
        ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("minimal trailer should parse");
    let trailer = parsed.trailer();

    assert_eq!(trailer.size(), 6);
    assert_eq!(
        trailer.root().target(),
        ObjectId::new(
            ObjectNumber::new(1).expect("positive object number"),
            GenerationNumber::new(0)
        )
    );
    assert_eq!(trailer.prev(), None);
    assert_eq!(trailer.xref_stm(), None);
    assert_eq!(trailer.info(), None);
    assert_eq!(trailer.id(), None);
    assert_eq!(trailer.encrypt(), None);
}

// 辞書内のキーの出現順序が結果に影響しないことを確認する
#[test]
fn key_order_does_not_matter() {
    let input = simple_trailer("/Root 1 0 R /Size 6");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("trailer with reversed key order should parse");
    let trailer = parsed.trailer();

    assert_eq!(trailer.size(), 6);
    assert_eq!(
        trailer.root().target(),
        ObjectId::new(
            ObjectNumber::new(1).expect("positive object number"),
            GenerationNumber::new(0)
        )
    );
}

// /Size 0 が非負整数として受理されることを確認する
#[test]
fn size_zero_is_accepted() {
    let input = simple_trailer("/Size 0 /Root 1 0 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("size 0 should parse");
    assert_eq!(parsed.trailer().size(), 0);
}

// /Size に i64::MAX (9223372036854775807) が指定されても正しく u64 として受け取れることを確認する
#[test]
fn size_at_i64_max_is_accepted() {
    let input = simple_trailer("/Size 9223372036854775807 /Root 1 0 R");
    let parsed =
        ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("size i64::MAX should parse");
    assert_eq!(parsed.trailer().size(), 9223372036854775807);
}

// /Root の世代番号が最大値 65535 の場合も正しく受け取れることを確認する
#[test]
fn root_with_max_generation_is_accepted() {
    let input = simple_trailer("/Size 6 /Root 1 65535 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("root with max generation should parse");
    assert_eq!(
        parsed.trailer().root().target(),
        ObjectId::new(
            ObjectNumber::new(1).expect("positive object number"),
            GenerationNumber::new(65535)
        )
    );
}

// /Size が欠落している場合に MissingRequiredKey エラーになることを確認する
#[test]
fn missing_size_is_rejected() {
    let input = simple_trailer("/Root 1 0 R");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("missing /Size should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::MissingRequiredKey {
            key: TrailerKey::Size,
        }
    );
}

// /Root が欠落している場合に MissingRequiredKey エラーになることを確認する
#[test]
fn missing_root_is_rejected() {
    let input = simple_trailer("/Size 6");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("missing /Root should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::MissingRequiredKey {
            key: TrailerKey::Root,
        }
    );
}

// 空のトレイラ辞書が MissingRequiredKey エラーになることを確認する
#[test]
fn empty_dictionary_is_rejected() {
    let input = simple_trailer("");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("empty dictionary should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::MissingRequiredKey {
            key: TrailerKey::Size,
        }
    );
}

// /Size が Integer 以外のすべての型で InvalidKeyType になることを確認する
#[test]
fn size_with_wrong_type_is_rejected() {
    let cases: [(&str, ObjectKind); 6] = [
        ("/Size 1.5 /Root 1 0 R", ObjectKind::Real),
        ("/Size /Six /Root 1 0 R", ObjectKind::Name),
        ("/Size (six) /Root 1 0 R", ObjectKind::String),
        ("/Size [6] /Root 1 0 R", ObjectKind::Array),
        ("/Size true /Root 1 0 R", ObjectKind::Boolean),
        ("/Size 6 0 R /Root 1 0 R", ObjectKind::Reference),
    ];
    for (body, expected_kind) in cases {
        let input = simple_trailer(body);
        let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
            .expect_err("non-integer /Size should be rejected");
        assert_eq!(
            error.kind,
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Size,
                actual: expected_kind,
            },
            "body: {body}"
        );
    }
}

// /Size が負の整数の場合に NegativeValue エラーになることを確認する
#[test]
fn negative_size_is_rejected() {
    let input = simple_trailer("/Size -1 /Root 1 0 R");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("negative /Size should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::NegativeValue {
            key: TrailerKey::Size,
        }
    );
}

// /Root が間接参照以外の型の場合に InvalidKeyType エラーになることを確認する
#[test]
fn root_with_wrong_type_is_rejected() {
    let cases: [(&str, ObjectKind); 6] = [
        ("/Size 6 /Root 1", ObjectKind::Integer),
        ("/Size 6 /Root 1.0", ObjectKind::Real),
        ("/Size 6 /Root /Catalog", ObjectKind::Name),
        ("/Size 6 /Root (1 0 R)", ObjectKind::String),
        ("/Size 6 /Root [1 0 R]", ObjectKind::Array),
        ("/Size 6 /Root << >>", ObjectKind::Dictionary),
    ];
    for (body, expected_kind) in cases {
        let input = simple_trailer(body);
        let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
            .expect_err("non-reference /Root should be rejected");
        assert_eq!(
            error.kind,
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Root,
                actual: expected_kind,
            },
            "body: {body}"
        );
    }
}

// /Size null は ISO §7.3.7 で辞書から除去されるため「キー欠落」になることを確認する
#[test]
fn size_null_is_reported_as_missing() {
    let input = simple_trailer("/Size null /Root 1 0 R");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("/Size null should be rejected as missing");
    assert_eq!(
        error.kind,
        TrailerErrorKind::MissingRequiredKey {
            key: TrailerKey::Size,
        }
    );
}

// 重複キーがある場合にパーサの後勝ち仕様に従って最後の値が使われることを確認する
#[test]
fn duplicate_key_uses_last_value() {
    let input = simple_trailer("/Size 1 /Size 2 /Root 1 0 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("duplicate key should parse with last value");
    assert_eq!(parsed.trailer().size(), 2);
}
