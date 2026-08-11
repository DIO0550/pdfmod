use super::super::SCAN_LIMIT;
use crate::byte_offset::ByteOffset;
use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::header::PdfHeader;

#[test]
fn parse_empty_input_returns_invalid_header_without_position() {
    // 空入力が位置なしの InvalidHeader になることを確認する
    let error = PdfHeader::parse(b"").expect_err("not a pdf");
    assert_eq!(error.code(), PdfErrorCode::InvalidHeader);
    assert_eq!(error.position(), None);
}

#[test]
fn parse_non_pdf_returns_invalid_header() {
    // PDF でないテキストが InvalidHeader になることを確認する
    let error = PdfHeader::parse(b"not a pdf at all").expect_err("not a pdf");
    assert_eq!(error.code(), PdfErrorCode::InvalidHeader);
}

#[test]
fn parse_signature_far_beyond_limit_returns_invalid_header() {
    // 2000 バイトの前置き後のシグネチャが検出されないことを確認する
    let mut input = vec![b'x'; 2000];
    input.extend_from_slice(b"%PDF-1.7\n");
    let error = PdfHeader::parse(&input).expect_err("signature outside limit");
    assert_eq!(error.code(), PdfErrorCode::InvalidHeader);
}

#[test]
fn parse_unsupported_version_returns_version_position() {
    // 未サポート版のエラー位置が版表記の開始位置 5 になることを確認する
    let error = PdfHeader::parse(b"%PDF-1.9\n").expect_err("invalid version");
    assert_eq!(error.position(), Some(ByteOffset::new(5)));
}

#[test]
fn parse_unsupported_version_message_contains_actual_version() {
    // 未サポート版のメッセージに実際の版表記が含まれることを確認する
    let error = PdfHeader::parse(b"%PDF-1.9\n").expect_err("invalid version");
    assert!(error
        .message()
        .is_some_and(|message| message.contains("unsupported version 1.9")));
}

#[test]
fn parse_truncated_signature_returns_invalid_header() {
    // 1 バイト足りないシグネチャが InvalidHeader になることを確認する
    let error = PdfHeader::parse(b"%PDF").expect_err("truncated signature");
    assert_eq!(error.code(), PdfErrorCode::InvalidHeader);
}

#[test]
fn parse_non_utf8_version_returns_unsupported_version() {
    // 非 UTF-8 の版表記が panic せず UnsupportedVersion になることを確認する
    let error = PdfHeader::parse(b"%PDF-\xFF\xFE\n").expect_err("invalid version");
    assert_eq!(error.code(), PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_prefixed_unsupported_version_returns_absolute_position() {
    // 前置き付き入力のエラー位置がファイル先頭基準の 42 になることを確認する
    let mut input = vec![b'x'; 37];
    input.extend_from_slice(b"%PDF-1.9\n");
    let error = PdfHeader::parse(&input).expect_err("invalid version");
    assert_eq!(error.position(), Some(ByteOffset::new(42)));
}

#[test]
fn parse_missing_version_returns_version_start_position() {
    // 版がない入力のエラー位置がシグネチャ直後の 5 になることを確認する
    let error = PdfHeader::parse(b"%PDF-").expect_err("missing version");
    assert_eq!(error.position(), Some(ByteOffset::new(5)));
}

#[test]
fn parse_missing_signature_message_mentions_scan_limit() {
    // シグネチャ未検出のメッセージが設定された走査上限に言及することを確認する
    let error = PdfHeader::parse(b"not a pdf").expect_err("not a pdf");
    let expected = format!("%PDF- signature not found within the first {SCAN_LIMIT} bytes");
    assert_eq!(error.message(), Some(expected.as_str()));
}

#[test]
fn parse_non_utf8_version_message_uses_replacement_character() {
    // 非 UTF-8 の版表記が置換文字を含むメッセージへ安全に変換されることを確認する
    let error = PdfHeader::parse(b"%PDF-\xFF\xFE\n").expect_err("invalid version");
    assert!(error
        .message()
        .is_some_and(|message| message.contains('\u{FFFD}')));
}

#[test]
fn parse_error_codes_are_mutually_distinct() {
    // 3 種のヘッダ解析エラーコードを呼び出し側で区別できることを確認する
    let codes = [
        PdfHeader::parse(b"").expect_err("not a pdf").code(),
        PdfHeader::parse(b"%PDF-")
            .expect_err("missing version")
            .code(),
        PdfHeader::parse(b"%PDF-1.9\n")
            .expect_err("invalid version")
            .code(),
    ];
    assert_eq!(
        codes,
        [
            PdfErrorCode::InvalidHeader,
            PdfErrorCode::UnexpectedEof,
            PdfErrorCode::UnsupportedVersion,
        ]
    );
    assert_ne!(codes[0], codes[1]);
    assert_ne!(codes[0], codes[2]);
    assert_ne!(codes[1], codes[2]);
}
