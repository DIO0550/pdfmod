use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;

// 未知のカスタムキーが存在しても無視され、必須キーの取得に影響しないことを確認する
#[test]
fn unknown_key_is_ignored() {
    let input = simple_trailer("/Size 1 /Root 1 0 R /Custom 42");
    let parsed =
        ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("unknown key should be ignored");
    assert_eq!(parsed.trailer().size(), 1);
}

// ネストした辞書を持つ未知キーが存在しても無視され正常に解析できることを確認する
#[test]
fn unknown_key_with_nested_dictionary_is_ignored() {
    let input = simple_trailer("/Size 1 /Root 1 0 R /Custom << /A << /B 1 >> >>");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("nested dictionary unknown key should be ignored");
    assert_eq!(parsed.trailer().size(), 1);
}

// ネストした配列を持つ未知キーが存在しても無視され正常に解析できることを確認する
#[test]
fn unknown_key_with_nested_array_is_ignored() {
    let input = simple_trailer("/Size 1 /Root 1 0 R /Custom [1 [2 [3]]]");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("nested array unknown key should be ignored");
    assert_eq!(parsed.trailer().size(), 1);
}

// 間接参照を持つ未知キーが存在しても無視され正常に解析できることを確認する
#[test]
fn unknown_key_with_reference_is_ignored() {
    let input = simple_trailer("/Size 1 /Root 1 0 R /Custom 7 0 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("reference unknown key should be ignored");
    assert_eq!(parsed.trailer().size(), 1);
}
