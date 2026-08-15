use super::tail;
use crate::byte_offset::ByteOffset;
use crate::file::startxref::StartXref;

#[test]
fn parse_accepts_lf_crlf_and_cr_separated_tails() {
    // LF / CRLF / CR のいずれの改行でも同じオフセットが得られることを確認する
    let cases: [(&str, &str); 3] = [("\n", "LF"), ("\r\n", "CRLF"), ("\r", "CR")];
    for (eol, name) in cases {
        let input = tail("dummy body", "9", eol);
        let start_xref = StartXref::parse(&input)
            .unwrap_or_else(|error| panic!("{name} separated tail should parse: {error}"));
        assert_eq!(
            start_xref.offset(),
            ByteOffset::new(9),
            "{name} separated tail should yield the recorded offset"
        );
    }
}

#[test]
fn parse_comment_between_keyword_and_offset_is_skipped() {
    // startxref と数値の間に挟まったコメントを読み飛ばせることを確認する
    let input = b"dummy body\nstartxref%comment\n5\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("comment is skippable");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}

#[test]
fn parse_comment_between_offset_and_eof_marker_is_skipped() {
    // 数値と %%EOF の間に挟まったコメントを残余バイトとみなさないことを確認する
    let input = b"dummy\nstartxref\n5 %comment\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("comment is skippable");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}
