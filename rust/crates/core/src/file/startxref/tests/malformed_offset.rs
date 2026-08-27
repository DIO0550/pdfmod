use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::startxref::StartXref;

/// 全長 25 バイトで、`startxref` の値だけを差し替えられる末尾構造。
///
/// 値は 2 桁固定で、ファイル長ちょうど / ファイル長 - 1 の境界を作り分ける。
fn tail_of_25_bytes(offset: &str) -> Vec<u8> {
    let input = format!("dummy\nstartxref\n{offset}\n%%EOF\n").into_bytes();
    assert_eq!(input.len(), 25, "offset must be a two-digit number");
    input
}

#[test]
fn parse_missing_digits_returns_offset_not_found() {
    // startxref の後に数字が 1 桁も無い入力がエラーになることを確認する
    let error = StartXref::parse(b"dummy\nstartxref\nabc\n%%EOF\n").expect_err("value is broken");
    assert_eq!(error.kind, FileErrorKind::OffsetNotFound);
}

#[test]
fn parse_trailing_garbage_after_digits_returns_unexpected_bytes() {
    // 数字列の後に残ったバイトを黙って無視せずエラーにすることを確認する
    let error =
        StartXref::parse(b"dummy\nstartxref\n123abc\n%%EOF\n").expect_err("garbage after value");
    assert_eq!(error.kind, FileErrorKind::UnexpectedBytesBeforeEofMarker);
}

#[test]
fn parse_offset_beyond_file_length_returns_offset_out_of_file() {
    // ファイル長を大きく超えるオフセットを受理せずエラーにすることを確認する
    let error = StartXref::parse(b"startxref\n99999\n%%EOF\n").expect_err("offset is too large");
    assert_eq!(
        error.kind,
        FileErrorKind::OffsetOutOfFile {
            value: 99999,
            file_len: 22,
        }
    );
}

#[test]
fn parse_offset_equal_to_file_length_returns_offset_out_of_file() {
    // ファイル長ちょうどのオフセット（末尾の 1 バイト先）を無効として扱うことを確認する
    let input = tail_of_25_bytes("25");
    let error = StartXref::parse(&input).expect_err("offset points past the last byte");
    assert_eq!(
        error.kind,
        FileErrorKind::OffsetOutOfFile {
            value: 25,
            file_len: 25,
        }
    );
}

#[test]
fn parse_offset_at_last_byte_is_accepted() {
    // 指せる最大の位置（ファイル長 - 1）を受理することを確認する
    let input = tail_of_25_bytes("24");
    let start_xref = StartXref::parse(&input).expect("last byte is addressable");
    assert_eq!(start_xref.offset(), ByteOffset::new(24));
}

#[test]
fn parse_offset_overflowing_u64_returns_offset_overflow() {
    // 20 桁の数字列が u64 を溢れても panic せずエラーになることを確認する
    let error = StartXref::parse(b"dummy\nstartxref\n99999999999999999999\n%%EOF\n")
        .expect_err("offset overflows u64");
    assert_eq!(error.kind, FileErrorKind::OffsetOverflow);
}

#[test]
fn parse_digits_after_eof_marker_are_not_read() {
    // %%EOF より後ろにある数字を値として読まないことを確認する
    let error = StartXref::parse(b"startxref\n%%EOF\n123").expect_err("value is missing");
    assert_eq!(error.kind, FileErrorKind::OffsetNotFound);
}
