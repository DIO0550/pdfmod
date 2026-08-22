use super::super::ParsedTrailer;
use crate::byte_offset::ByteOffset;
use crate::object::object_kind::ObjectKind;
use crate::xref::trailer::error::TrailerErrorKind;

// 辞書が閉じられていない（>> が無い）場合に ObjectParseFailed エラーになることを確認する
#[test]
fn unclosed_dictionary_is_rejected() {
    let input = b"trailer\n<< /Size 1 /Root 1 0 R";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("unclosed dictionary should be rejected");
    assert!(matches!(
        error.kind,
        TrailerErrorKind::ObjectParseFailed { .. }
    ));
}

// trailer キーワードの後にオブジェクトが存在しない（EOF）場合に ObjectParseFailed エラーになることを確認する
#[test]
fn missing_dictionary_is_rejected() {
    let input = b"trailer\n";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("missing dictionary should be rejected");
    assert!(matches!(
        error.kind,
        TrailerErrorKind::ObjectParseFailed { .. }
    ));
}

// trailer の後が辞書ではなくスカラオブジェクトの場合に NotADictionary エラーになることを確認する
#[test]
fn non_dictionary_object_is_rejected() {
    let input = b"trailer\n42";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("integer instead of dictionary should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::NotADictionary {
            actual: ObjectKind::Integer,
        }
    );
}

// trailer の後が配列の場合に NotADictionary エラーになることを確認する
#[test]
fn array_instead_of_dictionary_is_rejected() {
    let input = b"trailer\n[1 2 3]";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("array instead of dictionary should be rejected");
    assert_eq!(
        error.kind,
        TrailerErrorKind::NotADictionary {
            actual: ObjectKind::Array,
        }
    );
}

// 辞書のキーが名前ではない（数字など）場合に ObjectParseFailed エラーになることを確認する
#[test]
fn non_name_key_is_rejected() {
    let input = b"trailer\n<< 42 /Root 1 0 R >>";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("non-name key in dictionary should be rejected");
    assert!(matches!(
        error.kind,
        TrailerErrorKind::ObjectParseFailed { .. }
    ));
}

// 辞書の最後のキーに対応する値が存在しない場合に ObjectParseFailed エラーになることを確認する
#[test]
fn value_missing_for_last_key_is_rejected() {
    let input = b"trailer\n<< /Size >>";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("missing value for key should be rejected");
    assert!(matches!(
        error.kind,
        TrailerErrorKind::ObjectParseFailed { .. }
    ));
}

// 非ゼロの start 位置から開始した際のエラー位置が絶対オフセットで返ることを確認する
#[test]
fn error_position_is_absolute() {
    let prefix = b"%PDF-1.7\n%dummy\n";
    let trailer_part = b"trailer\n42";
    let mut input = prefix.to_vec();
    input.extend_from_slice(trailer_part);

    let error = ParsedTrailer::parse(&input, ByteOffset::new(prefix.len() as u64))
        .expect_err("malformed trailer at offset should be rejected");
    assert_eq!(
        error.position,
        ByteOffset::new((prefix.len() + b"trailer\n".len()) as u64)
    );
}
