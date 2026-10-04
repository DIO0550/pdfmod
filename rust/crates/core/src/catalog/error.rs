//! カタログ構造と Root 解決の失敗。参照元または辞書の位置を保持する。

use super::key::CatalogKey;
use crate::{
    byte_offset::ByteOffset, object::object_kind::ObjectKind, resolver::error::ResolveError,
};

/// カタログ取得・検証の失敗理由。
#[derive(Debug, PartialEq)]
pub enum CatalogErrorKind {
    /// `ObjectResolver::new` で構築され、トレイラを持たない。
    MissingTrailer,
    /// Root の解決に失敗した。下位エラーを保持する。
    RootResolutionFailed(ResolveError),
    /// Root が辞書でない。未定義・解放済み参照は Null となる。
    NotADictionary {
        /// 解決されたオブジェクトの種別。
        actual: ObjectKind,
    },
    /// Type または Pages が存在しない。
    MissingRequiredKey {
        /// 欠落したキー。
        key: CatalogKey,
    },
    /// エントリの型が不正。
    InvalidKeyType {
        /// 対象キー。
        key: CatalogKey,
        /// 実際の種別。
        actual: ObjectKind,
    },
    /// Type が Catalog 以外の名前。
    InvalidType,
    /// Version が未対応または形式不正の名前。
    InvalidVersion,
}

/// 全エラーで位置を保持する。Root 解決時は参照元トレイラの位置を示す。
#[derive(Debug, PartialEq)]
pub struct CatalogError {
    kind: CatalogErrorKind,
    position: ByteOffset,
}

impl CatalogError {
    /// 理由とその検証コンテキストの位置から構築する。
    pub fn new(kind: CatalogErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// 失敗理由を返す。
    pub fn kind(&self) -> &CatalogErrorKind {
        &self.kind
    }

    /// ファイル先頭を基準とした検証コンテキストの位置を返す。
    pub fn position(&self) -> ByteOffset {
        self.position
    }
}
