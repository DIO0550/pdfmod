//! 文書順のページ列と走査警告（docs/specs/03_document_architecture.md §3, §4.3）。

pub mod attributes;
pub mod error;
pub mod index;
pub mod warning;

use std::rc::Rc;

use crate::object::{indirect_ref::IndirectRef, pdf_object::PdfObject};
use index::PageIndex;
use warning::PageTreeWarning;

/// 検証済みの葉ページ。元の辞書を resolver と共有し、属性の参照は保持する。
#[derive(Debug)]
pub struct Page {
    reference: IndirectRef,
    root: IndirectRef,
    object: Rc<PdfObject>,
}

impl Page {
    pub(crate) fn new(reference: IndirectRef, root: IndirectRef, object: Rc<PdfObject>) -> Self {
        Self {
            reference,
            root,
            object,
        }
    }

    pub(crate) fn root(&self) -> IndirectRef {
        self.root
    }

    /// Kids に記録されていたページの間接参照。
    pub fn reference(&self) -> IndirectRef {
        self.reference
    }

    /// ページ辞書。属性の継承・描画命令の解析は行わない。
    pub fn object(&self) -> &PdfObject {
        &self.object
    }
}

/// Kids の深さ優先走査で得たページ列。Count の宣言値で省略・水増ししない。
#[derive(Debug)]
pub struct PageTree {
    pages: Vec<Page>,
    warnings: Vec<PageTreeWarning>,
}

impl PageTree {
    pub(crate) fn into_parts(self) -> (Vec<Page>, Vec<PageTreeWarning>) {
        (self.pages, self.warnings)
    }

    pub(crate) fn new(pages: Vec<Page>, warnings: Vec<PageTreeWarning>) -> Self {
        Self { pages, warnings }
    }

    /// 文書順のページ列。空の Kids からは空のスライスを返す。
    pub fn pages(&self) -> &[Page] {
        &self.pages
    }

    /// 0 起点の型付き位置で取得する。実走査数の範囲外なら None。
    pub fn page(&self, index: PageIndex) -> Option<&Page> {
        self.pages.get(index.value())
    }

    /// Type 推定・Count 不正・各 Pages ノードの宣言数不一致の警告。
    pub fn warnings(&self) -> &[PageTreeWarning] {
        &self.warnings
    }
}
