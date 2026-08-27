use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::header::PdfHeader;
use crate::file::version::PdfVersion;

fn with_prefix(prefix_len: usize, body: &[u8]) -> Vec<u8> {
    let mut input = vec![b'x'; prefix_len];
    input.extend_from_slice(body);
    input
}

#[test]
fn origin_header_at_start_returns_zero() {
    // ファイル先頭のシグネチャが原点 0 になることを確認する
    let header = PdfHeader::parse(b"%PDF-1.7\n").expect("valid header");
    assert_eq!(header.origin(), ByteOffset::new(0));
}

#[test]
fn origin_header_after_prefix_returns_prefix_length() {
    // 37 バイトの前置き後にあるシグネチャが原点 37 になることを確認する
    let input = with_prefix(37, b"%PDF-1.7\n");
    let header = PdfHeader::parse(&input).expect("valid prefixed header");
    assert_eq!(header.origin(), ByteOffset::new(37));
}

#[test]
fn origin_signature_ending_at_scan_limit_is_found() {
    // 5 バイトのシグネチャ全体が走査上限内なら検出されることを確認する
    let input = with_prefix(1019, b"%PDF-1.7\n");
    let header = PdfHeader::parse(&input).expect("valid boundary header");
    assert_eq!(header.origin(), ByteOffset::new(1019));
}

#[test]
fn origin_signature_crossing_scan_limit_is_rejected() {
    // シグネチャが走査上限を 1 バイト跨ぐと検出されないことを確認する
    let input = with_prefix(1020, b"%PDF-1.7\n");
    let error = PdfHeader::parse(&input).expect_err("signature outside limit");
    assert_eq!(error.kind, FileErrorKind::SignatureNotFound);
}

#[test]
fn origin_multiple_signatures_uses_first() {
    // 複数のシグネチャがある場合に最初の版と原点を採用することを確認する
    let header = PdfHeader::parse(b"%PDF-1.4\njunk%PDF-1.7\n").expect("valid header");
    assert_eq!(header.origin(), ByteOffset::new(0));
    assert_eq!(header.version(), PdfVersion::V1_4);
}
