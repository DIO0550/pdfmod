//! 文書 API の各段階のエラーを型付きのまま束ねる。

use std::fmt;

use crate::{
    catalog::error::CatalogError,
    document_info::error::DocumentInfoError,
    object::{ObjectId, ObjectKind},
    page_tree::{attributes::error::PageAttributeError, error::PageTreeError},
    resolver::error::ResolveError,
};

/// 下位層の詳細を保持する文書取得エラー。
#[derive(Debug, PartialEq)]
pub enum DocumentError {
    /// ヘッダ・xref・間接参照の解決、または暗号化の拒否。
    Resolve(ResolveError),
    /// Root カタログの構造不正。
    Catalog(CatalogError),
    /// ページツリーの構造不正。
    PageTree(PageTreeError),
    /// 対象ページの必須属性・親チェーン不正。
    PageAttributes(PageAttributeError),
    /// 情報辞書全体の不正。項目ごとの不正は DocumentInfo 内に保持する。
    DocumentInfo(DocumentInfoError),
    /// Contents 本体がストリーム・配列・Null 以外、または配列要素がストリームでない。
    InvalidContents {
        /// 対象ページ。
        page: ObjectId,
        /// 配列内の位置。本体の不正なら None。
        index: Option<usize>,
        /// 解決後の実際の種別。
        actual: ObjectKind,
    },
}

impl fmt::Display for DocumentError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::Resolve(cause) => write!(f, "PDF resolution failed: {cause:?}"),
            Self::Catalog(cause) => write!(f, "invalid PDF catalog: {cause:?}"),
            Self::PageTree(cause) => write!(f, "invalid PDF page tree: {cause:?}"),
            Self::PageAttributes(cause) => write!(f, "invalid PDF page attributes: {cause:?}"),
            Self::DocumentInfo(cause) => write!(f, "invalid PDF document info: {cause:?}"),
            Self::InvalidContents {
                page,
                index,
                actual,
            } => {
                write!(
                    f,
                    "invalid Contents in page {page:?} at {index:?}: {actual:?}"
                )
            }
        }
    }
}

impl std::error::Error for DocumentError {}
