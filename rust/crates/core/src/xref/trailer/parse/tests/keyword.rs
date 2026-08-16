use super::super::ParsedTrailer;
use super::{simple_trailer, trailer};
use crate::byte_offset::ByteOffset;
use crate::xref::trailer::error::TrailerErrorKind;

// start がちょうど trailer キーワードの先頭を指しているときに正常に検出されることを確認する
#[test]
fn trailer_keyword_is_detected_at_start() {
    let input = simple_trailer("/Size 1 /Root 1 0 R");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0));
    assert!(parsed.is_ok());
}

// trailer キーワード直前の空白・改行がスキップされることを確認する
#[test]
fn whitespace_before_trailer_keyword_is_skipped() {
    let input = format!(
        "   \n\r\t{}",
        String::from_utf8_lossy(&simple_trailer("/Size 1 /Root 1 0 R"))
    )
    .into_bytes();
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0));
    assert!(parsed.is_ok());
}

// trailer キーワード直前のコメント行がスキップされることを確認する
#[test]
fn comment_before_trailer_keyword_is_skipped() {
    let input = format!(
        "% this is a comment\n{}",
        String::from_utf8_lossy(&simple_trailer("/Size 1 /Root 1 0 R"))
    )
    .into_bytes();
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0));
    assert!(parsed.is_ok());
}

// キーワードと辞書の間が \n / \r\n / \r / 空白のいずれでも正常に解析できることを確認する
#[test]
fn eol_variants_between_keyword_and_dictionary() {
    let separators = ["\n", "\r\n", "\r", " ", "  \t\n", "\n%comment\n"];
    for sep in separators {
        let input = trailer("/Size 1 /Root 1 0 R", sep);
        let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0));
        assert!(parsed.is_ok(), "failed with separator: {sep:?}");
    }
}

// trailer キーワードが無い（別のトークンがある）場合に MissingTrailerKeyword エラーになることを確認する
#[test]
fn missing_trailer_keyword_is_rejected() {
    let input = b"xref << /Size 1 /Root 1 0 R >>";
    let error = ParsedTrailer::parse(input, ByteOffset::new(0))
        .expect_err("non-trailer token should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::MissingTrailerKeyword);
    assert_eq!(error.position, ByteOffset::new(0));
}

// キーワード直後にトークン境界がない（連結している）場合に MissingTrailerKeyword エラーになることを確認する
#[test]
fn trailer_keyword_without_token_boundary_is_rejected() {
    let input = b"trailerX << /Size 1 /Root 1 0 R >>";
    let error =
        ParsedTrailer::parse(input, ByteOffset::new(0)).expect_err("trailerX should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::MissingTrailerKeyword);
    assert_eq!(error.position, ByteOffset::new(0));
}

// start が入力長と等しい場合に MissingTrailerKeyword エラーになることを確認する
#[test]
fn start_at_input_end_is_rejected() {
    let input = simple_trailer("/Size 1 /Root 1 0 R");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(input.len() as u64))
        .expect_err("start at EOF should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::MissingTrailerKeyword);
}

// start が入力長を超える場合に panic せず MissingTrailerKeyword エラーになることを確認する
#[test]
fn start_beyond_input_end_is_rejected() {
    let input = simple_trailer("/Size 1 /Root 1 0 R");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(input.len() as u64 + 100))
        .expect_err("start beyond EOF should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::MissingTrailerKeyword);
}

// start が usize::MAX / u64::MAX の場合に panic せず MissingTrailerKeyword エラーになることを確認する
#[test]
fn start_exceeding_usize_is_rejected() {
    let input = simple_trailer("/Size 1 /Root 1 0 R");
    let error = ParsedTrailer::parse(&input, ByteOffset::new(u64::MAX))
        .expect_err("start at u64::MAX should be rejected");
    assert_eq!(error.kind, TrailerErrorKind::MissingTrailerKeyword);
}
