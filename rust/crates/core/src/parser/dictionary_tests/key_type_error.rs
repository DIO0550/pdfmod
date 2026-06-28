use super::super::error::ParseErrorKind;
use super::parser;

fn expect_unexpected_token(input: &[u8], expected_kind: &'static str) {
    let mut p = parser(input);
    let err = p.parse_object().expect_err("key type error expected");
    assert_eq!(
        err.kind,
        ParseErrorKind::UnexpectedToken {
            actual_kind: expected_kind
        },
        "input={:?}",
        input
    );
}

#[test]
fn parse_object_rejects_integer_as_key() {
    // 入力 b"<< 42 1 >>" でキー位置が Integer の場合 UnexpectedToken { "Primitive" } を返すことを確認する
    expect_unexpected_token(b"<< 42 1 >>", "Primitive");
}

#[test]
fn parse_object_rejects_literal_string_as_key() {
    // 入力 b"<< (str) 1 >>" でキー位置が LiteralString の場合 UnexpectedToken { "Primitive" } を返すことを確認する
    expect_unexpected_token(b"<< (str) 1 >>", "Primitive");
}

#[test]
fn parse_object_rejects_hex_string_as_key() {
    // 入力 b"<< <48> 1 >>" でキー位置が HexString の場合 UnexpectedToken { "Primitive" } を返すことを確認する
    expect_unexpected_token(b"<< <48> 1 >>", "Primitive");
}

#[test]
fn parse_object_rejects_boolean_as_key() {
    // 入力 b"<< true 1 >>" でキー位置が Boolean の場合 UnexpectedToken { "Primitive" } を返すことを確認する
    expect_unexpected_token(b"<< true 1 >>", "Primitive");
}

#[test]
fn parse_object_rejects_null_as_key() {
    // 入力 b"<< null 1 >>" でキー位置が Null の場合 UnexpectedToken { "Primitive" } を返すことを確認する
    expect_unexpected_token(b"<< null 1 >>", "Primitive");
}

#[test]
fn parse_object_rejects_real_as_key() {
    // 入力 b"<< 1.5 1 >>" でキー位置が Real の場合 UnexpectedToken { "Primitive" } を返すことを確認する
    expect_unexpected_token(b"<< 1.5 1 >>", "Primitive");
}

#[test]
fn parse_object_rejects_array_begin_as_key() {
    // 入力 b"<< [1] 1 >>" でキー位置が ArrayBegin の場合 UnexpectedToken { "ArrayBegin" } を返すことを確認する
    expect_unexpected_token(b"<< [1] 1 >>", "ArrayBegin");
}

#[test]
fn parse_object_rejects_array_end_as_key() {
    // 入力 b"<< ] 1 >>" でキー位置が ArrayEnd の場合 UnexpectedToken { "ArrayEnd" } を返すことを確認する
    expect_unexpected_token(b"<< ] 1 >>", "ArrayEnd");
}

#[test]
fn parse_object_rejects_dict_begin_as_key() {
    // 入力 b"<< << /X 1 >> 1 >>" で外側辞書のキー位置に内側辞書 (DictBegin) が来た場合 UnexpectedToken { "DictBegin" } を返すことを確認する
    expect_unexpected_token(b"<< << /X 1 >> 1 >>", "DictBegin");
}

#[test]
fn parse_object_rejects_keyword_r_as_key() {
    // 入力 b"<< R 1 >>" でキー位置が Keyword (R) の場合 UnexpectedToken { "Keyword" } を返すことを確認する
    expect_unexpected_token(b"<< R 1 >>", "Keyword");
}

#[test]
fn parse_object_rejects_obj_begin_as_key() {
    // 入力 b"<< obj 1 >>" でキー位置が ObjBegin の場合 UnexpectedToken { "ObjBegin" } を返すことを確認する
    expect_unexpected_token(b"<< obj 1 >>", "ObjBegin");
}

#[test]
fn parse_object_rejects_stream_begin_as_key() {
    // 入力 b"<< stream 1 >>" でキー位置が StreamBegin の場合 UnexpectedToken { "StreamBegin" } を返すことを確認する
    expect_unexpected_token(b"<< stream 1 >>", "StreamBegin");
}
