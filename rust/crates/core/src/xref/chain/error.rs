//! xref チェーンの位置・原因付きエラー。
use crate::{
    byte_offset::ByteOffset,
    file::error::FileError,
    xref::{error::XRefError, trailer::error::TrailerError},
};

/// セクション解析エラーを保持し、循環・深さ超過と区別する。
#[derive(Debug, PartialEq)]
pub enum XRefChainError {
    /// ファイル末尾が不正。
    File(FileError),
    /// xref セクションが不正。
    XRef(XRefError),
    /// トレイラ辞書が不正。
    Trailer(TrailerError),
    /// 記録オフセットが補正後に範囲外になる。
    InvalidOffset(ByteOffset),
    /// 同じ実オフセットを再訪問した。
    Cycle(ByteOffset),
    /// セクション数が上限を超えた。
    TooDeep {
        /// 設定された上限。
        limit: usize,
        /// 読もうとした実位置。
        offset: ByteOffset,
    },
    /// 単独 xref ストリームにトレイラ必須キーがない。
    MissingTrailer(ByteOffset),
}
