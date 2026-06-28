use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_returns_unexpected_token_for_dict_end_in_array() {
    // 入力 b"[>>]" で配列要素中の DictEnd が UnexpectedToken { "DictEnd" } で fail-fast されることを確認する
    let mut p = parser(b"[>>]");
    let err = p.parse_object().expect_err("dict end must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "DictEnd"
        }
    );
}

#[test]
fn parse_object_returns_unexpected_token_for_obj_begin_in_array() {
    // 入力 b"[obj]" で配列要素中の ObjBegin が UnexpectedToken { "ObjBegin" } で fail-fast されることを確認する
    let mut p = parser(b"[obj]");
    let err = p.parse_object().expect_err("obj begin must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "ObjBegin"
        }
    );
}

#[test]
fn parse_object_returns_unexpected_token_for_obj_end_in_array() {
    // 入力 b"[endobj]" で配列要素中の ObjEnd が UnexpectedToken { "ObjEnd" } で fail-fast されることを確認する
    let mut p = parser(b"[endobj]");
    let err = p.parse_object().expect_err("obj end must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "ObjEnd"
        }
    );
}

#[test]
fn parse_object_returns_unexpected_token_for_stream_begin_in_array() {
    // 入力 b"[stream]" で配列要素中の StreamBegin が UnexpectedToken { "StreamBegin" } で fail-fast されることを確認する
    let mut p = parser(b"[stream]");
    let err = p.parse_object().expect_err("stream begin must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "StreamBegin"
        }
    );
}

#[test]
fn parse_object_returns_unexpected_token_for_stream_end_in_array() {
    // 入力 b"[endstream]" で配列要素中の StreamEnd が UnexpectedToken { "StreamEnd" } で fail-fast されることを確認する
    let mut p = parser(b"[endstream]");
    let err = p.parse_object().expect_err("stream end must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "StreamEnd"
        }
    );
}

#[test]
fn parse_object_returns_unexpected_token_for_keyword_r_in_array() {
    // 入力 b"[R]" で配列要素中の R キーワード (Keyword) が UnexpectedToken { "Keyword" } で fail-fast されることを確認する
    let mut p = parser(b"[R]");
    let err = p.parse_object().expect_err("keyword R must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "Keyword"
        }
    );
}

#[test]
fn parse_object_returns_unexpected_token_for_array_end_only() {
    // 入力 b"]" で parse_object 直 dispatch における ArrayEnd 単独が UnexpectedToken { "ArrayEnd" }, position=0 で返ることを確認する
    let mut p = parser(b"]");
    let err = p.parse_object().expect_err("array end alone must error");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: "ArrayEnd"
        }
    );
    assert_eq!(err.position, ByteOffset::new(0));
}
