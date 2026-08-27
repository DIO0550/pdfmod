use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::header::PdfHeader;

#[test]
fn parse_empty_input_returns_signature_not_found_at_scan_origin() {
    // 空入力が走査開始位置 0 の SignatureNotFound になることを確認する
    let error = PdfHeader::parse(b"").expect_err("not a pdf");
    assert_eq!(error.kind, FileErrorKind::SignatureNotFound);
    assert_eq!(error.position, ByteOffset::new(0));
}

#[test]
fn parse_non_pdf_returns_invalid_header() {
    // PDF でないテキストが SignatureNotFound になることを確認する
    let error = PdfHeader::parse(b"not a pdf at all").expect_err("not a pdf");
    assert_eq!(error.kind, FileErrorKind::SignatureNotFound);
}

#[test]
fn parse_signature_far_beyond_limit_returns_invalid_header() {
    // 2000 バイトの前置き後のシグネチャが検出されないことを確認する
    let mut input = vec![b'x'; 2000];
    input.extend_from_slice(b"%PDF-1.7\n");
    let error = PdfHeader::parse(&input).expect_err("signature outside limit");
    assert_eq!(error.kind, FileErrorKind::SignatureNotFound);
}

#[test]
fn parse_unsupported_version_returns_version_position() {
    // 未サポート版のエラー位置が版表記の開始位置 5 になることを確認する
    let error = PdfHeader::parse(b"%PDF-1.9\n").expect_err("invalid version");
    assert_eq!(error.position, ByteOffset::new(5));
}

#[test]
fn parse_unsupported_version_holds_actual_version_bytes() {
    // 未サポート版のエラーが実際の版表記を生バイト列で保持することを確認する
    let error = PdfHeader::parse(b"%PDF-1.9\n").expect_err("invalid version");
    assert_eq!(
        error.kind,
        FileErrorKind::UnsupportedVersion {
            actual: b"1.9".to_vec(),
        }
    );
}

#[test]
fn parse_truncated_signature_returns_invalid_header() {
    // 1 バイト足りないシグネチャが SignatureNotFound になることを確認する
    let error = PdfHeader::parse(b"%PDF").expect_err("truncated signature");
    assert_eq!(error.kind, FileErrorKind::SignatureNotFound);
}

#[test]
fn parse_prefixed_unsupported_version_returns_absolute_position() {
    // 前置き付き入力のエラー位置がファイル先頭基準の 42 になることを確認する
    let mut input = vec![b'x'; 37];
    input.extend_from_slice(b"%PDF-1.9\n");
    let error = PdfHeader::parse(&input).expect_err("invalid version");
    assert_eq!(error.position, ByteOffset::new(42));
}

#[test]
fn parse_missing_version_returns_version_start_position() {
    // 版がない入力のエラー位置がシグネチャ直後の 5 になることを確認する
    let error = PdfHeader::parse(b"%PDF-").expect_err("missing version");
    assert_eq!(error.position, ByteOffset::new(5));
}

#[test]
fn parse_non_utf8_version_preserves_raw_bytes() {
    // 非 UTF-8 の版表記が置換文字に潰れず生バイト列のまま保持されることを確認する
    let error = PdfHeader::parse(b"%PDF-\xFF\xFE\n").expect_err("invalid version");
    assert_eq!(
        error.kind,
        FileErrorKind::UnsupportedVersion {
            actual: vec![0xFF, 0xFE],
        }
    );
}

#[test]
fn parse_error_codes_are_mutually_distinct() {
    // 3 種のヘッダ解析エラーを呼び出し側で区別できることを確認する
    let kinds = [
        PdfHeader::parse(b"").expect_err("not a pdf").kind,
        PdfHeader::parse(b"%PDF-")
            .expect_err("missing version")
            .kind,
        PdfHeader::parse(b"%PDF-1.9\n")
            .expect_err("invalid version")
            .kind,
    ];
    assert_eq!(
        kinds,
        [
            FileErrorKind::SignatureNotFound,
            FileErrorKind::UnexpectedEof,
            FileErrorKind::UnsupportedVersion {
                actual: b"1.9".to_vec(),
            },
        ]
    );
    assert_ne!(kinds[0], kinds[1]);
    assert_ne!(kinds[0], kinds[2]);
    assert_ne!(kinds[1], kinds[2]);
}
