//! xref チェーンの位置・原因付きエラー。
use crate::{
    byte_offset::ByteOffset,
    file::error::{FileError, FileErrorKind},
    xref::{
        error::{XRefError, XRefErrorKind},
        trailer::error::{TrailerError, TrailerErrorKind},
    },
};

/// セクション解析エラーの種別。循環・深さ超過と区別する。
#[derive(Debug, PartialEq, Eq)]
pub enum XRefChainErrorKind {
    /// ファイル末尾が不正。
    File(FileErrorKind),
    /// xref セクションが不正。
    XRef(XRefErrorKind),
    /// トレイラ辞書が不正。
    Trailer(TrailerErrorKind),
    /// 記録オフセットが補正後に範囲外になる。
    InvalidOffset {
        /// PDF に記録された補正前のオフセット。
        recorded: ByteOffset,
    },
    /// 同じ実オフセットを再訪問した。
    Cycle,
    /// セクション数が上限を超えた。
    TooDeep {
        /// 設定された上限。
        limit: usize,
    },
    /// 単独 xref ストリームにトレイラ必須キーがない。
    MissingTrailer,
}

/// xref チェーン解析エラー。委譲先の検出位置をそのまま保持する。
#[derive(Debug, PartialEq, Eq)]
#[must_use]
pub struct XRefChainError {
    kind: XRefChainErrorKind,
    position: ByteOffset,
}

impl XRefChainError {
    /// 任意の種別と位置で構築する。位置の範囲は検証しない。
    pub fn new(kind: XRefChainErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// エラー種別を借用する。
    pub fn kind(&self) -> &XRefChainErrorKind {
        &self.kind
    }

    /// エラー位置を返す。原点補正が溢れた場合のみ補正前の記録値を返す。
    pub fn position(&self) -> ByteOffset {
        self.position
    }

    /// エラー種別の所有権を返す。
    pub fn into_kind(self) -> XRefChainErrorKind {
        self.kind
    }

    /// 範囲外の位置と補正前の記録値を保持する。
    pub fn invalid_offset_at(position: ByteOffset, recorded: ByteOffset) -> Self {
        Self::new(XRefChainErrorKind::InvalidOffset { recorded }, position)
    }

    /// 再訪問した実位置で循環エラーを構築する。
    pub fn cycle_at(position: ByteOffset) -> Self {
        Self::new(XRefChainErrorKind::Cycle, position)
    }

    /// 読もうとした実位置とセクション数上限で構築する。
    pub fn too_deep_at(position: ByteOffset, limit: usize) -> Self {
        Self::new(XRefChainErrorKind::TooDeep { limit }, position)
    }

    /// トレイラ必須キーのないストリームの実位置で構築する。
    pub fn missing_trailer_at(position: ByteOffset) -> Self {
        Self::new(XRefChainErrorKind::MissingTrailer, position)
    }
}

impl From<FileError> for XRefChainError {
    fn from(error: FileError) -> Self {
        Self::new(XRefChainErrorKind::File(error.kind), error.position)
    }
}

impl From<XRefError> for XRefChainError {
    fn from(error: XRefError) -> Self {
        Self::new(XRefChainErrorKind::XRef(error.kind), error.position)
    }
}

impl From<TrailerError> for XRefChainError {
    fn from(error: TrailerError) -> Self {
        Self::new(XRefChainErrorKind::Trailer(error.kind), error.position)
    }
}
