use super::super::PdfVersion;

#[test]
fn ordering_same_major_newer_version_is_greater() {
    // 同一メジャー版では新しいマイナー版の方が大きいことを確認する
    assert!(PdfVersion::V1_4 < PdfVersion::V1_7);
}

#[test]
fn ordering_across_major_versions_is_supported() {
    // PDF 2.0 が PDF 1.7 より大きいことを確認する
    assert!(PdfVersion::V1_7 < PdfVersion::V2_0);
}

#[test]
fn ordering_all_versions_matches_declaration_order() {
    // 9 版すべての隣接ペアが昇順になることを確認する
    let versions = [
        PdfVersion::V1_0,
        PdfVersion::V1_1,
        PdfVersion::V1_2,
        PdfVersion::V1_3,
        PdfVersion::V1_4,
        PdfVersion::V1_5,
        PdfVersion::V1_6,
        PdfVersion::V1_7,
        PdfVersion::V2_0,
    ];
    for pair in versions.windows(2) {
        assert!(pair[0] < pair[1]);
    }
}

#[test]
fn ordering_same_version_is_equal_and_not_less() {
    // 同一版同士は等価で一方が小さくならないことを確認する
    assert_eq!(PdfVersion::V1_7, PdfVersion::V1_7);
    assert!(!(PdfVersion::V1_7 < PdfVersion::V1_7));
}
