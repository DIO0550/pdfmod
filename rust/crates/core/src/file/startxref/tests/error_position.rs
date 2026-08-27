use super::super::SCAN_LIMIT;
use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::startxref::StartXref;

#[test]
fn eof_marker_not_found_reports_zero_for_short_input() {
    // 走査窓に収まる短い入力で、%%EOF 未検出の位置が 0 になることを確認する
    let input = b"no markers here";
    let error = StartXref::parse(input).expect_err("no %%EOF");
    assert_eq!(error.kind, FileErrorKind::EofMarkerNotFound);
    assert_eq!(error.position, ByteOffset::new(0));
}

#[test]
fn eof_marker_not_found_reports_window_start_for_long_input() {
    // 走査窓を超える入力で、%%EOF 未検出の位置が窓の先頭になることを確認する
    let input = vec![b'x'; SCAN_LIMIT + 100];
    let error = StartXref::parse(&input).expect_err("no %%EOF");
    assert_eq!(error.kind, FileErrorKind::EofMarkerNotFound);
    assert_eq!(error.position, ByteOffset::new(100));
}

#[test]
fn start_xref_not_found_reports_eof_marker_position() {
    // startxref 未検出の位置が %%EOF の開始位置になることを確認する
    let input = b"dummy\n%%EOF\n";
    let error = StartXref::parse(input).expect_err("no startxref");
    assert_eq!(error.kind, FileErrorKind::StartXrefNotFound);
    assert_eq!(error.position, ByteOffset::new(6));
}

#[test]
fn offset_not_found_reports_value_start_position() {
    // オフセット値の異常が値の開始位置で報告されることを確認する
    let input = b"dummy\nstartxref\nabc\n%%EOF\n";
    let error = StartXref::parse(input).expect_err("no digits");
    assert_eq!(error.kind, FileErrorKind::OffsetNotFound);
    assert_eq!(error.position, ByteOffset::new(15));
}

#[test]
fn unexpected_bytes_report_leftover_position() {
    // 余剰バイトが値の開始位置ではなく残余バイトの位置で報告されることを確認する
    let input = b"dummy\nstartxref\n123abc\n%%EOF\n";
    let error = StartXref::parse(input).expect_err("garbage after value");
    assert_eq!(error.kind, FileErrorKind::UnexpectedBytesBeforeEofMarker);
    assert_eq!(error.position, ByteOffset::new(19));
}

#[test]
fn offset_overflow_reports_value_start_position() {
    // u64 を溢れる値でも位置が値の開始位置で報告されることを確認する
    let input = b"dummy\nstartxref\n99999999999999999999\n%%EOF\n";
    let error = StartXref::parse(input).expect_err("offset overflows u64");
    assert_eq!(error.kind, FileErrorKind::OffsetOverflow);
    assert_eq!(error.position, ByteOffset::new(15));
}

#[test]
fn offset_out_of_file_reports_value_start_position() {
    // ファイル長超過の値でも位置が値の開始位置で報告されることを確認する
    let input = b"startxref\n99999\n%%EOF\n";
    let error = StartXref::parse(input).expect_err("offset is too large");
    assert_eq!(
        error.kind,
        FileErrorKind::OffsetOutOfFile {
            value: 99999,
            file_len: 22,
        }
    );
    assert_eq!(error.position, ByteOffset::new(9));
}
