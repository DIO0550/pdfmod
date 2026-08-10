use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::header::PdfHeader;
use crate::file::version::PdfVersion;

fn with_prefix(prefix_len: usize, body: &[u8]) -> Vec<u8> {
    let mut input = vec![b'x'; prefix_len];
    input.extend_from_slice(body);
    input
}

#[test]
fn parse_standard_header_returns_version() {
    // 標準的な PDF ヘッダから 1.7 を取得できることを確認する
    let header = PdfHeader::parse(b"%PDF-1.7\n").expect("valid header");
    assert_eq!(header.version(), PdfVersion::V1_7);
}

#[test]
fn parse_all_eol_kinds_returns_same_version() {
    // LF・CR・CRLF の各改行で同じ版を取得できることを確認する
    for input in [b"%PDF-1.7\n".as_slice(), b"%PDF-1.7\r", b"%PDF-1.7\r\n"] {
        let header = PdfHeader::parse(input).expect("valid header");
        assert_eq!(header.version(), PdfVersion::V1_7);
    }
}

#[test]
fn parse_header_without_eol_returns_version() {
    // EOL がない極小ヘッダからも版を取得できることを確認する
    let header = PdfHeader::parse(b"%PDF-1.7").expect("valid header");
    assert_eq!(header.version(), PdfVersion::V1_7);
}

#[test]
fn parse_version_followed_by_space_returns_version() {
    // 版の直後のスペースで読み取りを終端できることを確認する
    let header = PdfHeader::parse(b"%PDF-1.7 extra").expect("valid header");
    assert_eq!(header.version(), PdfVersion::V1_7);
}

#[test]
fn parse_unsupported_version_returns_error() {
    // ISO 未規定版が UnsupportedVersion になることを確認する
    let error = PdfHeader::parse(b"%PDF-1.9\n").expect_err("invalid version");
    assert_eq!(error.code(), PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_missing_version_returns_unexpected_eof() {
    // シグネチャ直後で入力が尽きると UnexpectedEof になることを確認する
    let error = PdfHeader::parse(b"%PDF-").expect_err("missing version");
    assert_eq!(error.code(), PdfErrorCode::UnexpectedEof);
}

#[test]
fn parse_version_over_maximum_length_returns_error() {
    // 8 バイトを超える版表記が上限で打ち切られて拒否されることを確認する
    let error = PdfHeader::parse(b"%PDF-123456789\n").expect_err("invalid version");
    assert_eq!(error.code(), PdfErrorCode::UnsupportedVersion);
}

#[test]
fn parse_version_beyond_scan_limit_returns_version() {
    // シグネチャが範囲内なら版表記が 1024 バイト以降でも読めることを確認する
    let input = with_prefix(1019, b"%PDF-1.7\n");
    let header = PdfHeader::parse(&input).expect("valid boundary header");
    assert_eq!(header.version(), PdfVersion::V1_7);
}

#[test]
fn parse_version_terminated_by_nul_returns_version() {
    // PDF のホワイトスペースである NUL が版表記を終端することを確認する
    let header = PdfHeader::parse(b"%PDF-1.7\0").expect("valid header");
    assert_eq!(header.version(), PdfVersion::V1_7);
}
