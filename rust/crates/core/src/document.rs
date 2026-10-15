//! バイト列から文書・ページ・情報辞書へ到達する公開 API（ISO 32000-1 §7.7）。

mod contents;
mod error;
mod page;

pub use error::DocumentError;
pub use page::PdfPage;

use std::rc::Rc;

use crate::{
    catalog::Catalog,
    document_info::DocumentInfo,
    object::{IndirectRef, PdfObject},
    page_tree::{index::PageIndex, warning::PageTreeWarning},
    resolver::ObjectResolver,
};

/// 入力をコピーせず借用する非暗号化 PDF 文書。構築時にはページを列挙しない。
/// 属性・情報辞書・描画ストリームはそれぞれ要求時に解決する。
#[derive(Debug)]
pub struct PdfDocument<'a> {
    resolver: ObjectResolver<'a>,
    catalog: Catalog,
    page_count: Option<usize>,
    warnings: Vec<PageTreeWarning>,
}

impl<'a> PdfDocument<'a> {
    /// ヘッダ・xref・トレイラ・カタログを検証する。構造不正・暗号化は Err。
    /// ページツリー・情報辞書・ストリームの不正は、その取得時に返す。
    ///
    /// ```
    /// use pdfmod_core::{PdfDocument, DocumentError, PageIndex};
    /// # fn example(bytes: &[u8]) -> Result<(), DocumentError> {
    /// let mut document = PdfDocument::open(bytes)?;
    /// if let Some(page) = document.page(PageIndex::from(0))? {
    ///     let dimensions = (page.media_box().width(), page.media_box().height());
    ///     let resources = page.resources();
    ///     let streams = document.content_streams(&page)?;
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn open(input: &'a [u8]) -> Result<Self, DocumentError> {
        let mut resolver = ObjectResolver::open(input).map_err(DocumentError::Resolve)?;
        let catalog = resolver.catalog().map_err(DocumentError::Catalog)?;
        Ok(Self {
            resolver,
            catalog,
            page_count: None,
            warnings: Vec::new(),
        })
    }

    /// 検証済みカタログ。内部の未解釈エントリは参照のまま保持する。
    pub fn catalog(&self) -> &Catalog {
        &self.catalog
    }

    /// Count の宣言値ではなく、文書順の実際の葉数を返す。構造不正は Err。
    /// 初回はツリー全体の辞書を走査するが、属性・Resources・Contents は解決しない。
    pub fn page_count(&mut self) -> Result<usize, DocumentError> {
        if let Some(count) = self.page_count {
            return Ok(count);
        }
        let tree = self
            .resolver
            .page_tree(&self.catalog)
            .map_err(DocumentError::PageTree)?;
        let (pages, warnings) = tree.into_parts();
        let count = pages.len();
        self.warnings = warnings;
        self.page_count = Some(count);
        Ok(count)
    }

    /// 0 起点の位置で継承属性を解決する。1 起点は PageNumber を Into で変換する。
    /// 対象までのツリー構造・対象ページの属性不正は Err、実走査範囲外は Ok(None)。
    /// 毎回先頭から対象までを走査し、後続ページ・Contents は読み込まない。
    pub fn page(&mut self, index: PageIndex) -> Result<Option<PdfPage>, DocumentError> {
        if self.page_count.is_some_and(|count| index.value() >= count) {
            return Ok(None);
        }
        let tree = self
            .resolver
            .page_prefix(&self.catalog, index)
            .map_err(DocumentError::PageTree)?;
        let (pages, warnings) = tree.into_parts();
        if self.page_count.is_none() {
            self.warnings = warnings;
        }
        let Some(page) = pages.into_iter().nth(index.value()) else {
            return Ok(None);
        };
        let attributes = self
            .resolver
            .page_attributes(&page)
            .map_err(DocumentError::PageAttributes)?;
        Ok(Some(PdfPage::new(page, attributes)))
    }

    /// Info を必要時に取得する。不在・Null は空の結果、項目単位の不正は結果内に保持する。
    /// 辞書全体の型・参照解決不正は Err。
    pub fn document_info(&mut self) -> Result<DocumentInfo, DocumentError> {
        self.resolver
            .document_info()
            .map_err(DocumentError::DocumentInfo)
    }

    /// 同じ文書のリソースなどへの参照を必要時に解決する。未定義・解放済みは Null。
    /// 循環・世代不一致・構文不正などは原因を保持した Err。
    pub fn resolve(&mut self, reference: IndirectRef) -> Result<Rc<PdfObject>, DocumentError> {
        self.resolver
            .resolve(reference)
            .map_err(DocumentError::Resolve)
    }

    /// 直近の成功したツリー走査の警告。page_count 成功後は全走査の警告を保持する。
    /// page だけを呼んだ場合、未走査部分の Count 不一致・構造不正は未検出。
    pub fn page_tree_warnings(&self) -> &[PageTreeWarning] {
        &self.warnings
    }
}

#[cfg(test)]
mod tests;
