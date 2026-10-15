use super::*;

#[test]
fn retrieves_multiple_pages_and_resolves_only_selected_attributes() {
    // Pages の属性を継承し、局所値で上書きする。リソース内の参照も利用できる。
    let mut pdf = PdfFixture::new(
        "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 600 800] /Rotate 90 /Resources 5 0 R >>",
    );
    pdf.object("<< /Type /Page /Parent 2 0 R >>");
    pdf.object("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 400] /CropBox [10 20 290 380] /Rotate -90 >>");
    pdf.object("<< /Font << /F1 6 0 R >> >>");
    pdf.object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert_eq!(document.page_count().unwrap(), 2);

    let first = document.page(PageIndex::from(0)).unwrap().unwrap();
    assert_eq!(first.media_box().width(), 600.0);
    assert_eq!(first.media_box().height(), 800.0);
    assert_eq!(first.crop_box(), first.media_box());
    assert_eq!(first.rotation().degrees(), 90);
    assert!(first.warnings().is_empty());
    let fonts = first.resources().get(b"Font".as_slice()).unwrap();
    let font = fonts
        .as_dictionary()
        .unwrap()
        .get(b"F1".as_slice())
        .unwrap();
    let PdfObject::Reference(reference) = font else {
        panic!("リソース内の参照が保存されていない");
    };
    assert!(document
        .resolve(*reference)
        .unwrap()
        .as_dictionary()
        .is_some());

    let second = document
        .page(PageNumber::new(2).unwrap().into())
        .unwrap()
        .unwrap();
    assert_eq!(second.media_box().width(), 300.0);
    assert_eq!(second.crop_box().width(), 280.0);
    assert_eq!(second.crop_box().height(), 360.0);
    assert_eq!(second.rotation().degrees(), 270);
    assert_eq!(
        second.entry(b"Parent").unwrap().kind(),
        ObjectKind::Reference
    );
    assert_ne!(first.reference(), second.reference());
    assert!(document.page(PageIndex::from(2)).unwrap().is_none());
    assert!(document
        .page(PageIndex::from(usize::MAX))
        .unwrap()
        .is_none());
}

#[test]
fn returns_none_outside_actual_tree_without_prior_count() {
    let data = PdfFixture::one_page("").finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert!(document.page(PageIndex::from(1)).unwrap().is_none());
    assert!(document
        .page(PageIndex::from(usize::MAX))
        .unwrap()
        .is_none());
    assert!(document.page(PageIndex::from(0)).unwrap().is_some());
}

#[test]
fn counts_actual_leaves_and_retains_count_warnings() {
    // Count の宣言を枝刈りに使わず、全走査の警告をページ取得後も保持する。
    let mut pdf = PdfFixture::new("<< /Type /Pages /Kids [3 0 R] /Count 99 >>");
    pdf.object("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 20] >>");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert_eq!(document.page_count().unwrap(), 1);
    assert_eq!(document.page_count().unwrap(), 1);
    assert!(matches!(
        document.page_tree_warnings(),
        [PageTreeWarning::CountMismatch {
            declared: 99,
            actual: 1,
            ..
        }]
    ));
    document.page(PageIndex::from(0)).unwrap().unwrap();
    assert_eq!(document.page_tree_warnings().len(), 1);
}

#[test]
fn traverses_nested_pages_in_document_order() {
    let mut pdf =
        PdfFixture::new("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 3 /MediaBox [0 0 10 20] >>");
    pdf.object("<< /Type /Pages /Parent 2 0 R /Kids [5 0 R 6 0 R] /Count 2 >>");
    pdf.object("<< /Type /Page /Parent 2 0 R /Rotate 180 >>");
    pdf.object("<< /Type /Page /Parent 3 0 R /Rotate 90 >>");
    pdf.object("<< /Type /Page /Parent 3 0 R /Rotate 270 >>");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    for (index, rotation) in [90, 270, 180].into_iter().enumerate() {
        assert_eq!(
            document
                .page(index.into())
                .unwrap()
                .unwrap()
                .rotation()
                .degrees(),
            rotation
        );
    }
    assert_eq!(document.page_count().unwrap(), 3);
}

#[test]
fn empty_tree_has_no_pages() {
    let data = PdfFixture::new("<< /Type /Pages /Kids [] /Count 0 >>").finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert!(document.page(0.into()).unwrap().is_none());
    assert_eq!(document.page_count().unwrap(), 0);
}

#[test]
fn retrieves_optional_document_info() {
    let mut pdf = PdfFixture::one_page("");
    pdf.object("<< /Title (Example) /Author (Writer) /CreationDate (D:20261015) >>");
    let data = pdf.finish("/Info 4 0 R");
    let mut document = PdfDocument::open(&data).unwrap();
    let info = document.document_info().unwrap();
    assert_eq!(info.title().unwrap().unwrap().as_str(), "Example");
    assert_eq!(info.author().unwrap().unwrap().as_str(), "Writer");
    assert!(info.creation_date().unwrap().is_some());
    assert!(document.catalog().entry(b"Pages").is_some());

    let data = PdfFixture::one_page("").finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert_eq!(document.document_info().unwrap().title().unwrap(), None);
}
