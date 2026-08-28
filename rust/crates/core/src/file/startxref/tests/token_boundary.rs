use crate::byte_offset::ByteOffset;
use crate::file::error::FileErrorKind;
use crate::file::startxref::StartXref;

#[test]
fn parse_rejects_markers_glued_to_regular_bytes() {
    // 前後が非境界バイトのマーカー（x%%EOF / %%EOFx / xstartxref / startxrefX）を
    // 誤検出しないことを確認する
    let cases: [(&[u8], FileErrorKind); 4] = [
        (b"startxref\n5\nx%%EOF\n", FileErrorKind::EofMarkerNotFound),
        (
            b"dummy\nstartxref\n5\n%%EOFx\n",
            FileErrorKind::EofMarkerNotFound,
        ),
        (b"xstartxref\n5\n%%EOF\n", FileErrorKind::StartXrefNotFound),
        (b"startxrefX\n5\n%%EOF\n", FileErrorKind::StartXrefNotFound),
    ];
    for (input, expected_kind) in cases {
        let error = StartXref::parse(input).expect_err("candidate is not a token");
        assert_eq!(error.kind, expected_kind, "kind: {expected_kind:?}");
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
fn parse_delimiter_between_offset_and_eof_marker_returns_unexpected_bytes() {
    // デリミタはトークン境界だが、オフセットと %%EOF の間に残っていれば残余バイトとして
    // 拒否されることを確認する（境界判定より残余バイト検査が後段で効く）
    let error =
        StartXref::parse(b"dummy\nstartxref\n5\n>>%%EOF\n").expect_err("delimiter is left over");
    assert_eq!(error.kind, FileErrorKind::UnexpectedBytesBeforeEofMarker);
}
