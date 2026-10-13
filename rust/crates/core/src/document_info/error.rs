//! 情報辞書全体の取得失敗と、項目単位の失敗を区別する。

use crate::{
    byte_offset::ByteOffset, object::ObjectKind, resolver::error::ResolveError,
    text_string::error::TextDecodeError,
};

/// 情報辞書を取得できない理由。
#[derive(Debug, PartialEq)]
pub enum DocumentInfoErrorKind {
    /// トレイラを保持しない resolver を使用した。
    MissingTrailer,
    /// Info の参照解決に失敗した。
    Resolution(ResolveError),
    /// Info の解決結果が辞書でも Null でもない。
    NotADictionary {
        /// 解決された値の種別。
        actual: ObjectKind,
    },
}

/// 情報辞書全体の取得失敗。位置は参照元トレイラ（不在時はヘッダ）。
#[derive(Debug, PartialEq)]
pub struct DocumentInfoError {
    kind: DocumentInfoErrorKind,
    position: ByteOffset,
}

impl DocumentInfoError {
    /// 原因と取得コンテキストの実ファイル位置を保持する。
    pub fn new(kind: DocumentInfoErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// 辞書全体の取得失敗の原因。
    pub fn kind(&self) -> &DocumentInfoErrorKind {
        &self.kind
    }

    /// ファイル先頭を基準とした取得コンテキストの位置。
    pub fn position(&self) -> ByteOffset {
        self.position
    }
}

/// 1項目の解析失敗。他の項目は引き続き取得できる。
#[derive(Debug, PartialEq)]
pub enum InfoValueError {
    /// 値の間接参照を解決できない。
    Resolution(ResolveError),
    /// 期待する文字列・名前と異なる型。
    InvalidType {
        /// 実際の値の種別。
        actual: ObjectKind,
    },
    /// テキストの符号化が不正。位置は復元済みバイト列内で、ファイル位置ではない。
    TextDecode(TextDecodeError),
    /// 日付の構文またはカレンダー・時刻・タイムゾーンが不正。
    InvalidDate,
}
