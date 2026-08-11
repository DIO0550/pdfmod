use crate::byte_offset::ByteOffset;
use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::header::PdfHeader;

fn assert_error_code(input: &[u8], expected: PdfErrorCode) {
    let error = PdfHeader::parse(input).expect_err("version should be rejected");
    assert_eq!(error.code(), expected);
}

#[test]
fn parse_empty_version_returns_unexpected_eof() {
    // ハイフン直後が EOL の空版を UnexpectedEof と分類することを確認する
    assert_error_code(b"%PDF-\n", PdfErrorCode::UnexpectedEof);
}

#[test]
fn parse_whitespace_before_version_returns_unexpected_eof() {
    // ハイフン直後が空白またはタブなら空版として分類することを確認する
    for input in [b"%PDF- 1.7\n".as_slice(), b"%PDF-\t1.7\n"] {
        assert_error_code(input, PdfErrorCode::UnexpectedEof);
    }
}

#[test]
fn parse_double_hyphen_returns_unsupported_version() {
    // 二重ハイフンの版表記を UnsupportedVersion と分類することを確認する
    assert_error_code(b"%PDF--1.7\n", PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_zero_padded_version_returns_unsupported_version() {
    // ゼロ埋めされた版表記を UnsupportedVersion と分類することを確認する
    assert_error_code(b"%PDF-01.7\n", PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_wrong_version_separators_returns_unsupported_version() {
    // ピリオド以外の版区切りを UnsupportedVersion と分類することを確認する
    for input in [b"%PDF-1,7\n".as_slice(), b"%PDF-1-7\n"] {
        assert_error_code(input, PdfErrorCode::UnsupportedVersion);
    }
}

#[test]
fn parse_delimiter_after_version_returns_unsupported_version() {
    // 版の直後のデリミタでは読み取りを終端しないことを確認する
    assert_error_code(b"%PDF-1.7/Type\n", PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_comment_after_version_returns_unsupported_version() {
    // 版の直後のコメント記号では読み取りを終端しないことを確認する
    assert_error_code(b"%PDF-1.7%comment\n", PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_eol_inside_version_returns_unsupported_version() {
    // 版の途中の EOL で切り出された不完全な表記を拒否することを確認する
    assert_error_code(b"%PDF-1.\r7\n", PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_signature_at_limit_without_version_returns_eof_position() {
    // 上限内のシグネチャ直後で終端した場合の位置が 1024 になることを確認する
    let mut input = vec![b'x'; 1019];
    input.extend_from_slice(b"%PDF-");
    let error = PdfHeader::parse(&input).expect_err("missing version");
    assert_eq!(error.code(), PdfErrorCode::UnexpectedEof);
    assert_eq!(error.position(), Some(ByteOffset::new(1024)));
}

#[test]
fn parse_non_utf8_version_returns_unsupported_version() {
    // 非 UTF-8 の版表記を panic せず拒否することを確認する
    assert_error_code(b"%PDF-\xFF\xFE\n", PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_full_width_version_returns_unsupported_version() {
    // 全角の版表記を読み取り上限内で拒否することを確認する
    assert_error_code("%PDF-１．７\n".as_bytes(), PdfErrorCode::UnsupportedVersion);
}
