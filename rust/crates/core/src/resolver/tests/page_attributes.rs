use super::*;
use crate::object::ObjectKind;
use crate::page_tree::{
    attributes::{
        error::{PageAttributeError, PageAttributeKey, PageAttributeWarningKind},
        PageAttributes, PageRotation,
    },
    index::PageIndex,
};

mod inheritance;
mod malformed;
mod rotation;

fn fixture(root: &str, page: &str) -> PdfFixture {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Type /Catalog /Pages 2 0 R >>");
    pdf.object(2, 0, root);
    pdf.object(3, 0, page);
    pdf
}

fn attributes(data: &[u8]) -> Result<PageAttributes, PageAttributeError> {
    let mut resolver = ObjectResolver::open(data).unwrap();
    let catalog = resolver.catalog().unwrap();
    let tree = resolver.page_tree(&catalog).unwrap();
    resolver.page_attributes(tree.page(PageIndex::from(0)).unwrap())
}
