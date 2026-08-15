use super::super::SCAN_LIMIT;
use crate::byte_offset::ByteOffset;
use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::startxref::StartXref;

/// 走査窓の境界テスト用の末尾構造（`startxref` から `%%EOF` の改行まで）。
const WINDOW_TAIL: &[u8] = b"startxref\n500\n%%EOF\n";

#[test]
fn parse_trailing_garbage_within_scan_limit_is_accepted() {
    // %%EOF の後に余剰の改行が付いていても解析できることを確認する
    let input = b"dummy\nstartxref\n5\n%%EOF\n\n\n";
    let start_xref = StartXref::parse(input).expect("trailing bytes are tolerated");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}

#[test]
fn parse_input_of_exactly_scan_limit_bytes_succeeds() {
    // 入力長がちょうど走査上限（1024 バイト）の PDF を解析できることを確認する
    let tail = "\nstartxref\n500\n%%EOF\n";
    let padding = "x".repeat(SCAN_LIMIT - tail.len());
    let input = format!("{padding}{tail}").into_bytes();
    assert_eq!(input.len(), SCAN_LIMIT);
    let start_xref = StartXref::parse(&input).expect("structure is inside the window");
    assert_eq!(start_xref.offset(), ByteOffset::new(500));
}

#[test]
fn parse_startxref_at_first_byte_of_window_succeeds() {
    // startxref の先頭が走査窓のちょうど最初のバイトに載る境界を受理することを確認する
    let mut input = WINDOW_TAIL.to_vec();
    input.extend(std::iter::repeat_n(b'z', SCAN_LIMIT - WINDOW_TAIL.len()));
    assert_eq!(input.len(), SCAN_LIMIT);
    let start_xref = StartXref::parse(&input).expect("keyword sits on the window edge");
    assert_eq!(start_xref.offset(), ByteOffset::new(500));
}

#[test]
fn parse_startxref_one_byte_before_window_returns_invalid_syntax() {
    // 末尾ゴミが 1 バイト増えて startxref が走査窓から出た境界を拒否することを確認する
    let mut input = WINDOW_TAIL.to_vec();
    input.extend(std::iter::repeat_n(
        b'z',
        SCAN_LIMIT - WINDOW_TAIL.len() + 1,
    ));
    let error = StartXref::parse(&input).expect_err("keyword is outside the window");
    assert_eq!(error.code(), PdfErrorCode::InvalidSyntax);
    assert!(error
        .message()
        .is_some_and(|message| message.contains("startxref keyword not found")));
}

#[test]
fn parse_eof_marker_beyond_scan_limit_returns_invalid_syntax() {
    // 末尾 1024 バイトのゴミにより %%EOF が走査窓の外へ出た入力がエラーになることを確認する
    let mut input = WINDOW_TAIL.to_vec();
    input.extend(std::iter::repeat_n(b'z', SCAN_LIMIT));
    let error = StartXref::parse(&input).expect_err("%%EOF is outside the scan window");
    assert_eq!(error.code(), PdfErrorCode::InvalidSyntax);
    let expected = format!("%%EOF not found within the last {SCAN_LIMIT} bytes");
    assert_eq!(error.message(), Some(expected.as_str()));
}

#[test]
fn parse_startxref_outside_window_with_eof_inside_returns_invalid_syntax() {
    // %%EOF は窓内でも startxref が窓の外なら拒否することを確認する
    // （TypeScript 実装は無制限に遡って受理するが、有限走査を優先した意図的な差異）
    let mut input = b"dummy\nstartxref\n0\n%%EOF\n".to_vec();
    // %%EOF がちょうど窓の先頭に載るだけのパディングを足し、startxref だけを窓の外へ出す
    let eof_pos = input.len() - b"%%EOF\n".len();
    let padding = eof_pos + SCAN_LIMIT - input.len();
    input.extend(std::iter::repeat_n(b' ', padding));
    let error = StartXref::parse(&input).expect_err("keyword is outside the window");
    assert_eq!(error.code(), PdfErrorCode::InvalidSyntax);
    assert!(error
        .message()
        .is_some_and(|message| message.contains("startxref keyword not found before %%EOF")));
}

#[test]
fn parse_huge_input_scans_only_the_tail() {
    // 数 MiB の入力でも末尾だけを走査して即座に解析できることを確認する
    const BODY_LEN: usize = 4 * 1024 * 1024;
    let mut input = vec![0x00; BODY_LEN];
    input.extend_from_slice(b"\nstartxref\n7\n%%EOF\n");
    let start_xref = StartXref::parse(&input).expect("tail is valid");
    assert_eq!(start_xref.offset(), ByteOffset::new(7));
}
