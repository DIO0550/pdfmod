use super::super::super::byte_offset::ByteOffset;
use super::super::error::ParseError;
use super::parser;

#[test]
fn parse_indirect_object_empty_input_returns_unexpected_eof() {
    // ヘッダ途中 EOF(空入力): b"" は N 取得位置で即入力終端となり UnexpectedEof を位置 0 で返す（panic しない）
    let mut p = parser(b"");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_eof_at(ByteOffset::new(0)))
    );
}

#[test]
fn parse_indirect_object_object_number_only_returns_unexpected_eof() {
    // ヘッダ途中 EOF(N のみ): b"1" は G 取得位置で入力が尽き UnexpectedEof を位置 1 で返す（panic しない）
    let mut p = parser(b"1");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_eof_at(ByteOffset::new(1)))
    );
}

#[test]
fn parse_indirect_object_number_and_generation_only_returns_unexpected_eof() {
    // ヘッダ途中 EOF(N G のみ): b"1 0" は obj 要求位置で入力が尽き UnexpectedEof を位置 3 で返す（panic しない）
    let mut p = parser(b"1 0");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_eof_at(ByteOffset::new(3)))
    );
}

#[test]
fn parse_indirect_object_header_without_content_returns_unexpected_eof() {
    // ヘッダ途中 EOF(N G obj のみ): b"1 0 obj" は content 読取位置で入力が尽き UnexpectedEof を位置 7 で返す（panic しない）
    let mut p = parser(b"1 0 obj");
    assert_eq!(
        p.parse_indirect_object(),
        Err(ParseError::unexpected_eof_at(ByteOffset::new(7)))
    );
}
