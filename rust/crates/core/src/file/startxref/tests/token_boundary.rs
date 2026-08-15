use crate::byte_offset::ByteOffset;
use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::startxref::StartXref;

#[test]
fn parse_rejects_markers_glued_to_regular_bytes() {
    // 前後が非境界バイトのマーカー（x%%EOF / %%EOFx / xstartxref / startxrefX）を
    // 誤検出しないことを確認する
    let cases: [(&[u8], &str); 4] = [
        (b"startxref\n5\nx%%EOF\n", "%%EOF not found"),
        (b"dummy\nstartxref\n5\n%%EOFx\n", "%%EOF not found"),
        (b"xstartxref\n5\n%%EOF\n", "startxref keyword not found"),
        (b"startxrefX\n5\n%%EOF\n", "startxref keyword not found"),
    ];
    for (input, expected_message) in cases {
        let error = StartXref::parse(input).expect_err("candidate is not a token");
        assert_eq!(
            error.code(),
            PdfErrorCode::InvalidSyntax,
            "{expected_message}: unexpected error code"
        );
        assert!(
            error
                .message()
                .is_some_and(|message| message.contains(expected_message)),
            "error message should mention {expected_message}"
        );
    }
}

#[test]
fn parse_keyword_preceded_by_delimiter_is_accepted() {
    // トレイラ辞書の閉じ括弧に接した startxref のように、境界が空白以外でも受理することを確認する
    let input = b"dummy\n>>startxref\n5\n%%EOF\n";
    let start_xref = StartXref::parse(input).expect("delimiter is a token boundary");
    assert_eq!(start_xref.offset(), ByteOffset::new(5));
}

#[test]
fn parse_delimiter_between_offset_and_eof_marker_returns_invalid_syntax() {
    // デリミタはトークン境界だが、オフセットと %%EOF の間に残っていれば残余バイトとして
    // 拒否されることを確認する（境界判定より残余バイト検査が後段で効く）
    let error =
        StartXref::parse(b"dummy\nstartxref\n5\n>>%%EOF\n").expect_err("delimiter is left over");
    assert_eq!(error.code(), PdfErrorCode::InvalidSyntax);
    assert!(error
        .message()
        .is_some_and(|message| message.contains("unexpected bytes between")));
}
