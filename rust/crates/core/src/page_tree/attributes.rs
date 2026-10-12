//! ページの継承属性と既定値（docs/specs/03_document_architecture.md §4.1）。

pub mod error;
mod rotation;

pub use rotation::PageRotation;

use crate::{geometry::rectangle::Rectangle, object::PdfDictionary};
use error::PageAttributeWarning;

/// 継承・参照解決済みの属性。MediaBox は必須、CropBox は省略時に MediaBox を使う。
#[derive(Debug)]
pub struct PageAttributes {
    media: Rectangle,
    crop: Option<Rectangle>,
    resources: PdfDictionary,
    rotation: PageRotation,
    warnings: Vec<PageAttributeWarning>,
}

impl PageAttributes {
    pub(crate) fn new(
        media: Rectangle,
        crop: Option<Rectangle>,
        resources: PdfDictionary,
        rotation: PageRotation,
        warnings: Vec<PageAttributeWarning>,
    ) -> Self {
        Self {
            media,
            crop,
            resources,
            rotation,
            warnings,
        }
    }

    /// 対角の順序を正規化した物理メディア矩形。
    pub fn media_box(&self) -> &Rectangle {
        &self.media
    }

    /// 継承した表示矩形。省略時は MediaBox。MediaBox との交差はまだ適用しない。
    pub fn crop_box(&self) -> &Rectangle {
        self.crop.as_ref().unwrap_or(&self.media)
    }

    /// 最も近い有効なリソース辞書。どこにも無ければ空。内部の参照は保持する。
    pub fn resources(&self) -> &PdfDictionary {
        &self.resources
    }

    /// 0・90・180・270度に正規化した時計回りの回転。省略時は0度。
    pub fn rotation(&self) -> PageRotation {
        self.rotation
    }

    /// 探索を継続した無効な局所値と参照解決失敗。欠落・直接 null は警告しない。
    pub fn warnings(&self) -> &[PageAttributeWarning] {
        &self.warnings
    }
}
