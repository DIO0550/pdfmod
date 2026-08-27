use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::header::PdfHeader;

fn assert_error_kind(input: &[u8], expected: FileErrorKind) {
    let error = PdfHeader::parse(input).expect_err("version should be rejected");
    assert_eq!(error.kind, expected);
}

/// 未対応版の期待 kind を、読み取られる版表記の生バイト列から組み立てる。
fn unsupported_version(actual: &[u8]) -> FileErrorKind {
    FileErrorKind::UnsupportedVersion {
        actual: actual.to_vec(),
    }
}

#[test]
fn parse_empty_version_returns_unexpected_eof() {
    // ハイフン直後が EOL の空版を UnexpectedEof と分類することを確認する
    assert_error_kind(b"%PDF-\n", FileErrorKind::UnexpectedEof);
}

#[test]
fn parse_whitespace_before_version_returns_unexpected_eof() {
    // ハイフン直後が空白またはタブなら空版として分類することを確認する
    for input in [b"%PDF- 1.7\n".as_slice(), b"%PDF-\t1.7\n"] {
        assert_error_kind(input, FileErrorKind::UnexpectedEof);
    }
}

#[test]
fn parse_double_hyphen_returns_unsupported_version() {
    // 二重ハイフンの版表記を UnsupportedVersion と分類することを確認する
    assert_error_kind(b"%PDF--1.7\n", unsupported_version(b"-1.7"));
}

#[test]
fn parse_zero_padded_version_returns_unsupported_version() {
    // ゼロ埋めされた版表記を UnsupportedVersion と分類することを確認する
    assert_error_kind(b"%PDF-01.7\n", unsupported_version(b"01.7"));
}

#[test]
fn parse_wrong_version_separators_returns_unsupported_version() {
    // ピリオド以外の版区切りを UnsupportedVersion と分類することを確認する
    let cases: [(&[u8], &[u8]); 2] = [(b"%PDF-1,7\n", b"1,7"), (b"%PDF-1-7\n", b"1-7")];
    for (input, actual) in cases {
        assert_error_kind(input, unsupported_version(actual));
    }
}

#[test]
fn parse_delimiter_after_version_returns_unsupported_version() {
    // 版の直後のデリミタでは読み取りを終端しないことを確認する
    assert_error_kind(b"%PDF-1.7/Type\n", unsupported_version(b"1.7/Type"));
}

#[test]
fn parse_comment_after_version_returns_unsupported_version() {
    // 版の直後のコメント記号では読み取りを終端しないことを確認する
    assert_error_kind(b"%PDF-1.7%comment\n", unsupported_version(b"1.7%comm"));
}

#[test]
fn parse_eol_inside_version_returns_unsupported_version() {
    // 版の途中の EOL で切り出された不完全な表記を拒否することを確認する
    assert_error_kind(b"%PDF-1.\r7\n", unsupported_version(b"1."));
}

#[test]
fn parse_signature_at_limit_without_version_returns_eof_position() {
    // 上限内のシグネチャ直後で終端した場合の位置が 1024 になることを確認する
    let mut input = vec![b'x'; 1019];
    input.extend_from_slice(b"%PDF-");
    let error = PdfHeader::parse(&input).expect_err("missing version");
    assert_eq!(error.kind, FileErrorKind::UnexpectedEof);
    assert_eq!(error.position, ByteOffset::new(1024));
}

#[test]
fn parse_non_utf8_version_returns_unsupported_version() {
    // 非 UTF-8 の版表記を panic せず拒否することを確認する
    assert_error_kind(b"%PDF-\xFF\xFE\n", unsupported_version(&[0xFF, 0xFE]));
}

#[test]
fn parse_full_width_version_returns_unsupported_version() {
    // 全角の版表記を読み取り上限内で拒否することを確認する
    // 全角 3 文字は UTF-8 で 9 バイトあり、読み取り上限の 8 バイトで打ち切られる
    assert_error_kind(
        "%PDF-１．７\n".as_bytes(),
        unsupported_version(&[0xEF, 0xBC, 0x91, 0xEF, 0xBC, 0x8E, 0xEF, 0xBC]),
    );
}
