use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_returns_unexpected_eof_for_open_dict_only() {
    // 入力 b"<<" で `<<` 直後 EOF が UnexpectedEof, position=2 で返ることを確認する
    let mut p = parser(b"<<");
    let err = p.parse_object().expect_err("unclosed dict must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    assert_eq!(err.position, ByteOffset::new(2));
}

#[test]
fn parse_object_returns_unexpected_eof_for_open_dict_then_key_only() {
    // 入力 b"<< /A" でキーだけで EOF となった場合、値読み中の parse_object() 経由で UnexpectedEof が伝播することを確認する
    let mut p = parser(b"<< /A");
    let err = p.parse_object().expect_err("key without value must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_returns_unexpected_eof_for_complete_entry_then_eof() {
    // 入力 b"<< /A 1" で値読了後 `>>` 不在 EOF が UnexpectedEof で返ることを確認する
    let mut p = parser(b"<< /A 1");
    let err = p.parse_object().expect_err("eof after value must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_returns_unexpected_eof_for_second_key_only_then_eof() {
    // 入力 b"<< /A 1 /B" で 2 つ目キーの値読み中 EOF が UnexpectedEof で返ることを確認する
    let mut p = parser(b"<< /A 1 /B");
    let err = p
        .parse_object()
        .expect_err("second key without value must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_returns_unexpected_eof_for_two_complete_entries_then_eof() {
    // 入力 b"<< /A 1 /B 2" で 2 エントリ読了後 `>>` 不在 EOF が UnexpectedEof で返ることを確認する
    let mut p = parser(b"<< /A 1 /B 2");
    let err = p
        .parse_object()
        .expect_err("eof after two entries must error");
    assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
}

#[test]
fn parse_object_returns_unexpected_token_dict_end_when_value_missing() {
    // 入力 b"<< /A >>" でキー /A の値位置に `>>` が来た場合、値読み中の parse_object() 経由で
    // UnexpectedToken { actual_kind: "DictEnd" } が返ることを確認する（仕様準拠の副次挙動）
    let mut p = parser(b"<< /A >>");
    let err = p
        .parse_object()
        .expect_err("missing value before `>>` must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "DictEnd"
        }
    );
}
