//! ページ境界検証の失敗と辞書コンテキスト。

use super::key::PageBoxKey;
use crate::{byte_offset::ByteOffset, geometry::rectangle::RectangleError, object::ObjectKind};

/// ページ境界検証の失敗理由。
#[derive(Debug, PartialEq)]
pub enum PageBoxErrorKind {
    /// 継承済みの辞書にも MediaBox がない。
    MissingMediaBox,
    /// 配列以外の値（未解決参照を含む）。
    NotAnArray {
        /// 実際のオブジェクト種別。
        actual: ObjectKind,
    },
    /// 配列の矩形変換に失敗。
    InvalidRectangle(RectangleError),
}

/// 対象キーと呼び出し側の検証位置を持つエラー。
#[derive(Debug, PartialEq)]
pub struct PageBoxError {
    key: PageBoxKey,
    kind: PageBoxErrorKind,
    position: ByteOffset,
}

impl PageBoxError {
    pub(super) fn new(key: PageBoxKey, kind: PageBoxErrorKind, position: ByteOffset) -> Self {
        Self {
            key,
            kind,
            position,
        }
    }
    /// 不正なボックスのキー。
    pub fn key(&self) -> PageBoxKey {
        self.key
    }
    /// 失敗の理由。
    pub fn kind(&self) -> &PageBoxErrorKind {
        &self.kind
    }
    /// 呼び出し側が指定した辞書等のファイル位置。
    pub fn position(&self) -> ByteOffset {
        self.position
    }
}
