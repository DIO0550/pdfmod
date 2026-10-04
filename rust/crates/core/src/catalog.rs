//! ドキュメントカタログの検証と型表現（docs/specs/03_document_architecture.md §2）。

pub mod error;
pub mod key;
pub mod view;

use std::rc::Rc;

use crate::{
    byte_offset::ByteOffset,
    file::version::PdfVersion,
    object::{dictionary::PdfDictionary, indirect_ref::IndirectRef, pdf_object::PdfObject},
};
use error::{CatalogError, CatalogErrorKind};
use key::CatalogKey;
use view::{PageLayout, PageMode};

/// Type が Catalog、Pages が間接参照であることを保証するカタログ。
/// 元の辞書を resolver と共有し、未解釈エントリもコピー・参照解決せず保持する。
#[derive(Debug)]
pub struct Catalog {
    object: Rc<PdfObject>,
    pages: IndirectRef,
    declared_version: Option<PdfVersion>,
    version: PdfVersion,
    page_layout: PageLayout,
    page_mode: PageMode,
}

impl Catalog {
    /// 解決済みオブジェクトを検証する。辞書でない・必須キー欠落・型や版の不正はエラー。
    /// `position` は辞書または参照元の実ファイル位置。ヘッダより新しい版だけを優先する。
    pub fn from_object(
        object: Rc<PdfObject>,
        header_version: PdfVersion,
        position: ByteOffset,
    ) -> Result<Self, CatalogError> {
        let PdfObject::Dictionary(dictionary) = object.as_ref() else {
            return Err(CatalogError::new(
                CatalogErrorKind::NotADictionary {
                    actual: object.kind(),
                },
                position,
            ));
        };
        let catalog_type = Self::name(dictionary, CatalogKey::Type, position)?
            .ok_or_else(|| Self::missing(CatalogKey::Type, position))?;
        if catalog_type != b"Catalog" {
            return Err(CatalogError::new(CatalogErrorKind::InvalidType, position));
        }
        let pages = match dictionary.get(CatalogKey::Pages.as_bytes()) {
            None | Some(PdfObject::Null) => return Err(Self::missing(CatalogKey::Pages, position)),
            Some(PdfObject::Reference(reference)) => *reference,
            Some(value) => return Err(Self::invalid_type(CatalogKey::Pages, value, position)),
        };
        let declared_version = Self::name(dictionary, CatalogKey::Version, position)?
            .map(|bytes| {
                PdfVersion::from_bytes(bytes)
                    .ok_or_else(|| CatalogError::new(CatalogErrorKind::InvalidVersion, position))
            })
            .transpose()?;
        let page_layout = Self::name(dictionary, CatalogKey::PageLayout, position)?
            .map(PageLayout::from_bytes)
            .unwrap_or_default();
        let page_mode = Self::name(dictionary, CatalogKey::PageMode, position)?
            .map(PageMode::from_bytes)
            .unwrap_or_default();
        Ok(Self {
            object,
            pages,
            declared_version,
            version: header_version.max(declared_version.unwrap_or(header_version)),
            page_layout,
            page_mode,
        })
    }

    fn name(
        dictionary: &PdfDictionary,
        key: CatalogKey,
        position: ByteOffset,
    ) -> Result<Option<&[u8]>, CatalogError> {
        match dictionary.get(key.as_bytes()) {
            None | Some(PdfObject::Null) => Ok(None),
            Some(PdfObject::Name(name)) => Ok(Some(name.as_bytes())),
            Some(value) => Err(Self::invalid_type(key, value, position)),
        }
    }

    fn missing(key: CatalogKey, position: ByteOffset) -> CatalogError {
        CatalogError::new(CatalogErrorKind::MissingRequiredKey { key }, position)
    }

    fn invalid_type(key: CatalogKey, value: &PdfObject, position: ByteOffset) -> CatalogError {
        CatalogError::new(
            CatalogErrorKind::InvalidKeyType {
                key,
                actual: value.kind(),
            },
            position,
        )
    }

    /// ページツリールートの参照。参照先はまだ解決していない。
    pub fn pages(&self) -> IndirectRef {
        self.pages
    }

    /// カタログが宣言した版。省略時は None。
    pub fn declared_version(&self) -> Option<PdfVersion> {
        self.declared_version
    }

    /// ヘッダとカタログのうち新しい方の有効バージョン。
    pub fn version(&self) -> PdfVersion {
        self.version
    }

    /// 未知の名前・省略に対する既定値を適用した配置。
    pub fn page_layout(&self) -> PageLayout {
        self.page_layout
    }

    /// 未知の名前・省略に対する既定値を適用した表示モード。
    pub fn page_mode(&self) -> PageMode {
        self.page_mode
    }

    /// 元の辞書オブジェクト。既知・未知エントリとも未変更で保持する。
    pub fn object(&self) -> &PdfObject {
        &self.object
    }

    /// 任意エントリを解決せず返す。キーが無ければ None。
    /// Names / Outlines / AcroForm などの参照・直接辞書もそのまま返す。
    pub fn entry(&self, key: &[u8]) -> Option<&PdfObject> {
        let PdfObject::Dictionary(dictionary) = self.object.as_ref() else {
            return None;
        };
        dictionary.get(key)
    }
}

#[cfg(test)]
mod tests;
