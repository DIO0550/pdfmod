use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseErrorKind;
use super::parser;

#[test]
fn parse_object_returns_lexer_error_for_unterminated_hex_value() {
    // 入力 b"<< /A <48" で値位置の未終端 HexString が LexerError として伝播し、position が `<` の開始位置 (6) に固定されることを確認する
    let mut p = parser(b"<< /A <48");
    let err = p
        .parse_object()
        .expect_err("unterminated hex value must error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(6));
}

#[test]
fn parse_object_returns_lexer_error_for_invalid_hex_char_in_value() {
    // 入力 b"<< /A <4Z> >>" で値位置の不正 16 進文字 (`Z`) が LexerError として伝播し、position が `<` の開始位置 (6) に固定されることを確認する
    let mut p = parser(b"<< /A <4Z> >>");
    let err = p
        .parse_object()
        .expect_err("invalid hex char in value must error");
    assert_eq!(err.kind, ParseErrorKind::LexerError);
    assert_eq!(err.position, ByteOffset::new(6));
}
