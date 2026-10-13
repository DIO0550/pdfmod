//! 継承属性の回復警告と親チェーンの致命的エラー。

use crate::{
    geometry::rectangle::RectangleError,
    object::{ObjectId, ObjectKind},
    resolver::error::ResolveError,
};

/// 継承できる4つの属性。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageAttributeKey {
    /// 物理メディア矩形。
    MediaBox,
    /// 表示矩形。
    CropBox,
    /// 描画リソース辞書。
    Resources,
    /// 時計回りの回転角度。
    Rotate,
}

impl PageAttributeKey {
    pub(crate) fn as_bytes(self) -> &'static [u8] {
        match self {
            Self::MediaBox => b"MediaBox",
            Self::CropBox => b"CropBox",
            Self::Resources => b"Resources",
            Self::Rotate => b"Rotate",
        }
    }
}

/// 局所値を採用せず、祖先の探索を続けた理由。
#[derive(Debug, PartialEq)]
pub enum PageAttributeWarningKind {
    /// 値の型が属性に合わない。
    InvalidType {
        /// 解決後の型。
        actual: ObjectKind,
    },
    /// 矩形の要素数・座標が不正。
    InvalidRectangle(RectangleError),
    /// 整数だが90の倍数ではない。
    InvalidRotation {
        /// PDFに記録されていた角度。
        degrees: i64,
    },
    /// 値または矩形座標の参照を解決できなかった。
    Resolution(ResolveError),
}

/// 無効な属性のノード・キー・原因を保持する回復警告。
#[derive(Debug, PartialEq)]
pub struct PageAttributeWarning {
    node: ObjectId,
    key: PageAttributeKey,
    kind: PageAttributeWarningKind,
}

impl PageAttributeWarning {
    pub(crate) fn new(
        node: ObjectId,
        key: PageAttributeKey,
        kind: PageAttributeWarningKind,
    ) -> Self {
        Self { node, key, kind }
    }

    /// 無効な値を持つノード。
    pub fn node(&self) -> ObjectId {
        self.node
    }

    /// 無効な値のキー。
    pub fn key(&self) -> PageAttributeKey {
        self.key
    }

    /// 探索を続けた原因。
    pub fn kind(&self) -> &PageAttributeWarningKind {
        &self.kind
    }
}

/// 属性を確定できなかったページまたは親チェーンのエラー。
#[derive(Debug, PartialEq)]
pub enum PageAttributeError {
    /// ページから根まで有効な MediaBox がない。
    MissingMediaBox {
        /// 対象ページ。
        page: ObjectId,
    },
    /// 根以外で Parent が欠落・null。
    MissingParent {
        /// Parent を持つべきノード。
        node: ObjectId,
    },
    /// Parent が間接参照ではない。
    InvalidParent {
        /// Parent を持つノード。
        node: ObjectId,
        /// 実際の型。
        actual: ObjectKind,
    },
    /// カタログが指す根にも Parent がある。
    RootHasParent {
        /// 根ノード。
        node: ObjectId,
    },
    /// Parent チェーンの祖先を再訪した。
    ParentCycle {
        /// 再訪したノード。
        node: ObjectId,
    },
    /// Parent の参照解決が失敗した。
    ParentResolution {
        /// Parent を持つノード。
        node: ObjectId,
        /// 解決失敗の原因。
        cause: ResolveError,
    },
    /// 解決された親が辞書ではない。
    NotADictionary {
        /// 親の参照先。
        node: ObjectId,
        /// 実際の型。
        actual: ObjectKind,
    },
}
