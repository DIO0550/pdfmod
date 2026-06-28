use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_returns_lexer_error_for_unterminated_hex_in_array() {
    // 入力 b"[<48656C" で配列要素中の未終端 HexString が LexerError として fail-fast 伝播し、position=1 (`<` の開始位置) に固定されることを確認する
    let mut p = parser(b"[<48656C");
    let err = p
        .parse_object()
        .expect_err("unterminated hex in array must error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(1));
}

#[test]
fn parse_object_returns_lexer_error_for_unterminated_literal_in_array() {
    // 入力 b"[(abc" で配列要素中の未終端 LiteralString が LexerError として fail-fast 伝播し、position=1 (`(` の開始位置) に固定されることを確認する
    let mut p = parser(b"[(abc");
    let err = p
        .parse_object()
        .expect_err("unterminated literal in array must error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(1));
}

#[test]
fn parse_object_returns_lexer_error_for_scalar_then_unterminated_literal() {
    // 入力 b"[1 (abc" で先頭にスカラがある状態の未終端 LiteralString が LexerError として伝播し、position=3 (`(` の開始位置) に固定されることを確認する
    let mut p = parser(b"[1 (abc");
    let err = p
        .parse_object()
        .expect_err("scalar then unterminated must error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(3));
}
