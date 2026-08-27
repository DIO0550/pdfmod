use super::super::SCAN_LIMIT;
use super::tail;
use crate::byte_offset::ByteOffset;
use crate::file::startxref::StartXref;

#[test]
fn parse_standard_tail_returns_recorded_offset() {
    // 標準的な末尾構造から startxref の記録値が取り出せることを確認する
    let input = tail("dummy body", "9", "\n");
    let start_xref = StartXref::parse(&input).expect("valid startxref tail");
    assert_eq!(start_xref.offset(), ByteOffset::new(9));
}

#[test]
fn parse_offset_zero_is_accepted() {
    // オフセット 0（ファイル先頭を指す）が正当な値として受理されることを確認する
    let input = tail("dummy body", "0", "\n");
    let start_xref = StartXref::parse(&input).expect("zero offset is valid");
    assert_eq!(start_xref.offset(), ByteOffset::new(0));
}

#[test]
fn parse_file_ending_exactly_at_eof_marker_succeeds() {
    // %%EOF の後に改行が無くても解析できることを確認する
    let input = b"dummy\nstartxref\n5\n%%EOF";
    let start_xref = StartXref::parse(input).expect("trailing newline is optional");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}

#[test]
fn parse_input_shorter_than_scan_limit_succeeds() {
    // 入力全体が走査上限より短く scan_start が 0 に飽和しても解析できることを確認する
    let input = tail("dummy body", "3", "\n");
    assert!(
        input.len() < SCAN_LIMIT,
        "input should be shorter than the scan window"
    );
    let start_xref = StartXref::parse(&input).expect("short input is valid");
    assert_eq!(start_xref.offset(), ByteOffset::new(3));
}

#[test]
fn parse_accepts_every_whitespace_byte_as_separator() {
    // キーワードと数値の区切りに PDF のホワイトスペース 6 種すべてを使えることを確認する
    let cases: [(u8, &str); 6] = [
        (0x00, "NUL"),
        (0x09, "TAB"),
        (0x0A, "LF"),
        (0x0C, "FF"),
        (0x0D, "CR"),
        (0x20, "SP"),
    ];
    for (separator, name) in cases {
        let mut input = b"dummy\nstartxref".to_vec();
        input.push(separator);
        input.extend_from_slice(b"5\n%%EOF\n");
        let start_xref = StartXref::parse(&input)
            .unwrap_or_else(|error| panic!("{name} should separate the offset: {error:?}"));
        assert_eq!(
            start_xref.offset(),
            ByteOffset::new(5),
            "{name} separated tail should yield the recorded offset"
        );
    }
}

#[test]
fn parse_returns_recorded_value_without_header_origin_correction() {
    // 前置きバイトのある PDF でも記録値をそのまま返す（原点補正をしない）ことを確認する
    let input = b"junk\n%PDF-1.7\ndummy\nstartxref\n5\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("valid startxref tail");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}
