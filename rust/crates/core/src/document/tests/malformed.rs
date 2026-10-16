use super::*;
use crate::{page_tree::error::PageTreeError, resolver::error::ResolveError};

#[test]
fn rejects_broken_file_and_catalog_at_open() {
    for input in [b"".as_slice(), b"not a PDF", b"%PDF-1.7\n"] {
        assert!(matches!(
            PdfDocument::open(input),
            Err(DocumentError::Resolve(_))
        ));
    }
    let mut pdf = PdfFixture::new("<< /Type /Pages /Kids [] /Count 0 >>");
    pdf.object("42");
    let data = pdf.finish("/Root 3 0 R");
    assert!(matches!(
        PdfDocument::open(&data),
        Err(DocumentError::Catalog(_))
    ));
}

#[test]
fn rejects_encrypted_documents() {
    let data = PdfFixture::one_page("").finish("/Encrypt 99 0 R");
    assert!(matches!(
        PdfDocument::open(&data),
        Err(DocumentError::Resolve(ResolveError::EncryptedDocument))
    ));
}

#[test]
fn detects_cycles_in_page_queries_and_counting() {
    let data = PdfFixture::new("<< /Type /Pages /Kids [2 0 R] /Count 1 >>").finish("");
    let mut document = PdfDocument::open(&data).unwrap();
    assert!(matches!(
        document.page(0.into()),
        Err(DocumentError::PageTree(PageTreeError::Cycle { .. }))
    ));
    assert!(matches!(
        document.page_count(),
        Err(DocumentError::PageTree(PageTreeError::Cycle { .. }))
    ));
}

#[test]
fn invalid_info_items_remain_independent() {
    let mut pdf = PdfFixture::one_page("");
    pdf.object("<< /Title 42 /Author (Writer) >>");
    let data = pdf.finish("/Info 4 0 R");
    let mut document = PdfDocument::open(&data).unwrap();
    let info = document.document_info().unwrap();
    assert!(info.title().is_err());
    assert_eq!(info.author().unwrap().unwrap().as_str(), "Writer");
}
