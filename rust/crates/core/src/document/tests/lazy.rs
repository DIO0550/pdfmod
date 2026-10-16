use super::*;

#[test]
fn open_and_first_page_do_not_load_a_broken_later_page() {
    let mut pdf =
        PdfFixture::new("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 10 20] >>");
    pdf.object("<< /Type /Page /Parent 2 0 R >>");
    pdf.object("<<");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert!(document.page(0.into()).unwrap().is_some());
    assert!(matches!(
        document.page(1.into()),
        Err(DocumentError::PageTree(_))
    ));
    assert!(matches!(
        document.page_count(),
        Err(DocumentError::PageTree(_))
    ));
    // 失敗で走査状態を壊さず、再び正常ページを取得できる。
    assert!(document.page(0.into()).unwrap().is_some());
}

#[test]
fn counting_and_other_pages_do_not_resolve_broken_page_attributes() {
    let mut pdf = PdfFixture::new("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
    pdf.object("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 10 20] >>");
    pdf.object("<< /Type /Page /Parent 2 0 R /MediaBox 5 0 R /Resources 5 0 R >>");
    pdf.object("<<");
    let data = pdf.finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert_eq!(document.page_count().unwrap(), 2);
    assert!(document.page(0.into()).unwrap().is_some());
    assert!(matches!(
        document.page(1.into()),
        Err(DocumentError::PageAttributes(_))
    ));
}

#[test]
fn page_and_count_do_not_load_broken_contents_or_info() {
    let mut pdf = PdfFixture::one_page("/Contents 4 0 R");
    pdf.object("<<");
    pdf.object("<<");
    let data = pdf.finish("/Info 5 0 R");
    let mut document = PdfDocument::open(&data).unwrap();
    assert_eq!(document.page_count().unwrap(), 1);
    let page = document.page(0.into()).unwrap().unwrap();
    assert!(matches!(
        document.content_streams(&page),
        Err(DocumentError::Resolve(_))
    ));
    assert!(matches!(
        document.document_info(),
        Err(DocumentError::DocumentInfo(_))
    ));
}
