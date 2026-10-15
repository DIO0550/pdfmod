//! 継承属性と、未解決のページ辞書エントリを持つページ。

use crate::{
    geometry::rectangle::Rectangle,
    object::{IndirectRef, PdfDictionary, PdfObject},
    page_tree::{
        attributes::{error::PageAttributeWarning, PageAttributes, PageRotation},
        Page,
    },
};

/// 継承解決済みの MediaBox・CropBox・Rotate・Resources を持つページ。
/// 元の辞書も保持し、Contents とリソース辞書内の参照先は先読みしない。
#[derive(Debug)]
pub struct PdfPage {
    page: Page,
    attributes: PageAttributes,
}

impl PdfPage {
    pub(super) fn new(page: Page, attributes: PageAttributes) -> Self {
        Self { page, attributes }
    }

    /// ページ辞書への間接参照。
    pub fn reference(&self) -> IndirectRef {
        self.page.reference()
    }

    /// 物理メディア矩形。対角の順序は正規化済み。
    pub fn media_box(&self) -> &Rectangle {
        self.attributes.media_box()
    }

    /// 継承した表示矩形。省略時は MediaBox。MediaBox との交差は適用しない。
    pub fn crop_box(&self) -> &Rectangle {
        self.attributes.crop_box()
    }

    /// 0・90・180・270度に正規化した時計回りの回転。省略時は0度。
    pub fn rotation(&self) -> PageRotation {
        self.attributes.rotation()
    }

    /// 継承解決済みリソース辞書。内側のフォント・画像などの参照は保持する。
    pub fn resources(&self) -> &PdfDictionary {
        self.attributes.resources()
    }

    /// 元の Contents。単一ストリーム・配列への参照も解決しない。不在なら None。
    /// Null・型不正を含む生値であり、検証は PdfDocument::content_streams が行う。
    pub fn contents(&self) -> Option<&PdfObject> {
        self.entry(b"Contents")
    }

    /// ページ固有の未解決エントリ。不在なら None。継承した値はここには追加しない。
    pub fn entry(&self, key: &[u8]) -> Option<&PdfObject> {
        self.page.object().as_dictionary()?.get(key)
    }

    /// 属性の回復時に発生した警告。欠落・直接 Null は警告しない。
    pub fn warnings(&self) -> &[PageAttributeWarning] {
        self.attributes.warnings()
    }
}
