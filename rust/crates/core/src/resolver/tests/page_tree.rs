use super::*;
use crate::object::object_kind::ObjectKind;
use crate::page_tree::{
    error::{PageTreeError, PageTreeKey},
    index::{PageIndex, PageNumber},
    warning::{PageNodeKind, PageTreeWarning},
    PageTree,
};

mod malformed;
mod order;
mod scale;
mod structure;

fn fixture(root: &str) -> PdfFixture {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Type /Catalog /Pages 2 0 R >>");
    pdf.object(2, 0, root);
    pdf
}

fn walk(data: &[u8]) -> Result<PageTree, PageTreeError> {
    let mut resolver = ObjectResolver::open(data).unwrap();
    let catalog = resolver.catalog().unwrap();
    resolver.page_tree(&catalog)
}

fn references(tree: &PageTree) -> Vec<IndirectRef> {
    tree.pages().iter().map(|page| page.reference()).collect()
}
