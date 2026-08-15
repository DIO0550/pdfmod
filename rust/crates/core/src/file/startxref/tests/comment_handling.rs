use crate::byte_offset::ByteOffset;
use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::startxref::StartXref;

#[test]
fn parse_eof_marker_in_comment_body_is_skipped() {
    // コメント本文中の %%EOF を採用せず、後ろの本物の %%EOF を使うことを確認する
    let input = b"dummy body\nstartxref\n5\n%fake %%EOF here\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("real %%EOF follows the comment");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}

#[test]
fn parse_commented_out_startxref_is_rejected() {
    // 行頭 % でコメント化された startxref をキーワードと誤認しないことを確認する
    let error = StartXref::parse(b"%startxref\n5\n%%EOF\n").expect_err("keyword is commented out");
    assert_eq!(error.code(), PdfErrorCode::InvalidSyntax);
    assert!(error
        .message()
        .is_some_and(|message| message.contains("startxref keyword not found")));
}

#[test]
fn parse_eof_marker_inside_comment_is_rejected() {
    // %%%EOF がトークン境界を通っても、コメント内判定で棄却されることを確認する
    let error =
        StartXref::parse(b"dummy\nstartxref\n5\n%%%EOF\n").expect_err("candidate is commented");
    assert_eq!(error.code(), PdfErrorCode::InvalidSyntax);
}

#[test]
fn parse_inputs_without_eof_marker_return_invalid_syntax_without_panic() {
    // 空入力・マーカーより短い入力・マーカーが無い入力が panic せずエラーになることを確認する
    let cases: [(&[u8], &str); 3] = [
        (b"", "empty input"),
        (b"ab", "input shorter than the marker"),
        (b"no eof marker here", "input without any marker"),
    ];
    for (input, name) in cases {
        let error = StartXref::parse(input).expect_err("no %%EOF marker");
        assert_eq!(
            error.code(),
            PdfErrorCode::InvalidSyntax,
            "{name} should be rejected as invalid syntax"
        );
        assert!(
            error
                .message()
                .is_some_and(|message| message.contains("%%EOF not found")),
            "{name} should report the missing %%EOF"
        );
    }
}
