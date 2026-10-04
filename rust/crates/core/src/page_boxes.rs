//! ページ境界ボックスの既定値と MediaBox との交差（ISO 32000-1 §14.11.2）。

pub mod error;
pub mod key;

use crate::{
    byte_offset::ByteOffset,
    geometry::rectangle::Rectangle,
    object::{PdfDictionary, PdfObject},
};
use error::{PageBoxError, PageBoxErrorKind};
use key::PageBoxKey;

/// 検証済みのページボックス。任意ボックスは既定値を適用後、MediaBox と交差させる。
#[derive(Debug)]
pub struct PageBoxes {
    media: Rectangle,
    crop: Option<Rectangle>,
    bleed: Option<Rectangle>,
    trim: Option<Rectangle>,
    art: Option<Rectangle>,
}

impl PageBoxes {
    /// 継承・参照解決済みの辞書から構築する。MediaBox 欠落・ボックス不正はエラー。
    /// `position` は呼び出し側が把握している辞書等の位置で、個々の要素の位置ではない。
    pub fn from_dictionary(
        dictionary: &PdfDictionary,
        position: ByteOffset,
    ) -> Result<Self, PageBoxError> {
        let media = Self::read(dictionary, PageBoxKey::MediaBox, position)?.ok_or_else(|| {
            PageBoxError::new(
                PageBoxKey::MediaBox,
                PageBoxErrorKind::MissingMediaBox,
                position,
            )
        })?;
        Ok(Self {
            media,
            crop: Self::read(dictionary, PageBoxKey::CropBox, position)?,
            bleed: Self::read(dictionary, PageBoxKey::BleedBox, position)?,
            trim: Self::read(dictionary, PageBoxKey::TrimBox, position)?,
            art: Self::read(dictionary, PageBoxKey::ArtBox, position)?,
        })
    }

    fn read(
        dictionary: &PdfDictionary,
        key: PageBoxKey,
        position: ByteOffset,
    ) -> Result<Option<Rectangle>, PageBoxError> {
        match dictionary.get(key.as_bytes()) {
            None | Some(PdfObject::Null) => Ok(None),
            Some(PdfObject::Array(array)) => {
                Rectangle::try_from(array).map(Some).map_err(|error| {
                    PageBoxError::new(key, PageBoxErrorKind::InvalidRectangle(error), position)
                })
            }
            Some(value) => Err(PageBoxError::new(
                key,
                PageBoxErrorKind::NotAnArray {
                    actual: value.kind(),
                },
                position,
            )),
        }
    }

    fn crop_or_media(&self) -> &Rectangle {
        self.crop.as_ref().unwrap_or(&self.media)
    }

    fn effective(&self, rectangle: Option<&Rectangle>) -> Option<Rectangle> {
        rectangle
            .unwrap_or_else(|| self.crop_or_media())
            .intersection(&self.media)
    }

    /// 正規化した物理メディアの矩形。
    pub fn media_box(&self) -> &Rectangle {
        &self.media
    }
    /// 表示領域。省略時は MediaBox、交差がなければ None。
    pub fn crop_box(&self) -> Option<Rectangle> {
        self.effective(self.crop.as_ref())
    }
    /// 裁ち落とし領域。省略時は CropBox、MediaBox との交差がなければ None。
    pub fn bleed_box(&self) -> Option<Rectangle> {
        self.effective(self.bleed.as_ref())
    }
    /// 仕上がり領域。省略時は CropBox、MediaBox との交差がなければ None。
    pub fn trim_box(&self) -> Option<Rectangle> {
        self.effective(self.trim.as_ref())
    }
    /// コンテンツ領域。省略時は CropBox、MediaBox との交差がなければ None。
    pub fn art_box(&self) -> Option<Rectangle> {
        self.effective(self.art.as_ref())
    }
}

#[cfg(test)]
mod tests;
