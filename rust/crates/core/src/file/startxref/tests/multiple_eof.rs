use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::startxref::StartXref;

#[test]
fn parse_two_sections_returns_last_offset() {
    // %%EOF が 2 つあるとき後ろのセクションの値を採用することを確認する
    let input = b"dummy\nstartxref\n0\n%%EOF\nadded\nstartxref\n5\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("incrementally updated file");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}

#[test]
fn parse_three_sections_returns_last_offset() {
    // 2 回追記された PDF で最後のセクションの値を採用することを確認する
    let input =
        b"dummy\nstartxref\n0\n%%EOF\nadded\nstartxref\n5\n%%EOF\nmore\nstartxref\n11\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("incrementally updated file");
    assert_eq!(start_xref.offset(), ByteOffset::new(11));
}

#[test]
fn parse_broken_last_section_does_not_fall_back_to_earlier_section() {
    // 末尾セクションが壊れているとき前方の正常なセクションへフォールバックしないことを確認する
    // （古い xref を最新と誤認させないため、候補は最後の %%EOF で確定させる）
    let input = b"dummy\nstartxref\n0\n%%EOF\nstartxref\nabc\n%%EOF\n";
    let error = StartXref::parse(input).expect_err("last section is broken");
    assert_eq!(error.kind, FileErrorKind::OffsetNotFound);
}
