use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;
use crate::xref::trailer::error::TrailerErrorKind;

// /ID に 2 つの 16 進文字列が与えられた場合に永続 ID と変更 ID として正しく取り出せることを確認する
#[test]
fn id_with_two_hex_strings_is_extracted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID [<aabb> <ccdd>]");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("/ID with hex strings should parse");
    let id = parsed.trailer().id().expect("/ID should be Some");
    assert_eq!(id.permanent(), &[0xAA, 0xBB]);
    assert_eq!(id.changing(), &[0xCC, 0xDD]);
}

// /ID に 2 つのリテラル文字列が与えられた場合に永続 ID と変更 ID として正しく取り出せることを確認する
#[test]
fn id_with_literal_strings_is_extracted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID [(first) (second)]");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("/ID with literal strings should parse");
    let id = parsed.trailer().id().expect("/ID should be Some");
    assert_eq!(id.permanent(), b"first");
    assert_eq!(id.changing(), b"second");
}

// /ID の要素が空文字列の場合も正常に受け取れることを確認する
#[test]
fn id_with_empty_strings_is_accepted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID [<> <>]");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("/ID with empty strings should parse");
    let id = parsed.trailer().id().expect("/ID should be Some");
    assert_eq!(id.permanent(), b"");
    assert_eq!(id.changing(), b"");
}

// /ID の要素が 1 つしかない場合に InvalidIdArray エラーになることを確認する
#[test]
fn id_with_one_element_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID [<aabb>]");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("1-element /ID should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::InvalidIdArray);
}

// /ID の要素が 3 つある場合に InvalidIdArray エラーになることを確認する
#[test]
fn id_with_three_elements_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID [<aa> <bb> <cc>]");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("3-element /ID should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::InvalidIdArray);
}

// /ID が空配列の場合に InvalidIdArray エラーになることを確認する
#[test]
fn id_with_empty_array_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID []");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("empty array /ID should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::InvalidIdArray);
}

// /ID の要素に文字列以外のオブジェクトが含まれている場合に InvalidIdArray エラーになることを確認する
#[test]
fn id_with_non_string_element_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID [<aabb> 42]");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("non-string in /ID should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::InvalidIdArray);
}

// /ID の値が配列でない場合に InvalidIdArray エラーになることを確認する
#[test]
fn id_not_an_array_is_rejected() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /ID <aabbccdd>");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect_err("scalar /ID should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::InvalidIdArray);
}
