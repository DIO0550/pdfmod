//! PDF ファイル構造の解析（ヘッダ・`startxref`）専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。`parser::error::ParseError` /
//! `xref::error::XRefError` / `xref::trailer::error::TrailerError` と同じフラット構造を採る。
//! `Display` / `std::error::Error` は実装しない（`PdfError` への変換は後続 Issue）。
//!
//! [`FileErrorKind::UnsupportedVersion`] が `Vec<u8>` を内包するため `Copy` は実装しない
//! （`Clone` のみ）。

use crate::byte_offset::ByteOffset;

/// ファイル構造の解析エラーの種別。
///
/// 前半 3 つはヘッダ解析（`PdfHeader::parse`）、後半 6 つは `startxref` 解析
/// （`StartXref::parse`）で発生する。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum FileErrorKind {
    /// 先頭の走査範囲内に `%PDF-` が見つからない。
    ///
    /// 走査範囲は `header::SCAN_LIMIT` バイト。シグネチャ全体が範囲に収まっていない
    /// 場合（範囲を跨ぐ位置にある場合）も含む。
    /// 位置には走査開始位置（ファイル先頭の 0）が入る。
    SignatureNotFound,
    /// `%PDF-` の直後で入力が尽き、版表記が読めない。
    ///
    /// 直後がホワイトスペースで版表記が空文字列になる場合も含む。
    UnexpectedEof,
    /// 版表記が形式不正、または ISO 未規定の値だった。
    UnsupportedVersion {
        /// 実際に読み取った版表記の生バイト列。
        ///
        /// 非 UTF-8 のバイト列を含みうるため `String` ではなく `Vec<u8>` で保持する。
        actual: Vec<u8>,
    },
    /// 末尾の走査範囲内に `%%EOF` が見つからない。
    ///
    /// 走査範囲は末尾 `startxref::SCAN_LIMIT` バイト。コメント内の候補と、
    /// 前後がトークン境界でない候補は採用しないため、それらしか無い場合もここに来る。
    /// 位置には走査開始位置（末尾の走査窓の先頭）が入る。
    EofMarkerNotFound,
    /// `%%EOF` の手前に `startxref` キーワードが見つからない。
    StartXrefNotFound,
    /// `startxref` の後に 10 進数字が 1 桁も無い。
    OffsetNotFound,
    /// オフセット値の桁を蓄積する途中で `u64` を溢れた。
    OffsetOverflow,
    /// オフセット値と `%%EOF` の間に、空白・コメント以外のバイトが残っている。
    ///
    /// 位置には残余バイトの開始位置が入る（他の startxref 系バリアントが
    /// 値の開始位置を指すのと異なる）。
    UnexpectedBytesBeforeEofMarker,
    /// オフセット値がファイル長以上で、ファイル内のどのバイトも指せない。
    OffsetOutOfFile {
        /// `startxref` に記録されていた値。
        value: u64,
        /// 入力バイト列の長さ。
        file_len: u64,
    },
}

/// ファイル構造の解析エラー。位置情報を必須で保持する。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct FileError {
    /// エラーの種別と付随情報。
    pub kind: FileErrorKind,
    /// エラー発生位置（ファイル先頭からのバイトオフセット）。
    pub position: ByteOffset,
}

impl FileError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: FileErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// [`FileErrorKind::SignatureNotFound`] を指定位置で構築する。
    pub fn signature_not_found_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::SignatureNotFound, position)
    }

    /// [`FileErrorKind::UnexpectedEof`] を指定位置で構築する。
    pub fn unexpected_eof_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::UnexpectedEof, position)
    }

    /// [`FileErrorKind::UnsupportedVersion`] を指定位置・実バイト列で構築する。
    pub fn unsupported_version_at(position: ByteOffset, actual: Vec<u8>) -> Self {
        Self::new(FileErrorKind::UnsupportedVersion { actual }, position)
    }

    /// [`FileErrorKind::EofMarkerNotFound`] を指定位置で構築する。
    pub fn eof_marker_not_found_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::EofMarkerNotFound, position)
    }

    /// [`FileErrorKind::StartXrefNotFound`] を指定位置で構築する。
    pub fn start_xref_not_found_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::StartXrefNotFound, position)
    }

    /// [`FileErrorKind::OffsetNotFound`] を指定位置で構築する。
    pub fn offset_not_found_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::OffsetNotFound, position)
    }

    /// [`FileErrorKind::OffsetOverflow`] を指定位置で構築する。
    pub fn offset_overflow_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::OffsetOverflow, position)
    }

    /// [`FileErrorKind::UnexpectedBytesBeforeEofMarker`] を指定位置で構築する。
    pub fn unexpected_bytes_before_eof_marker_at(position: ByteOffset) -> Self {
        Self::new(FileErrorKind::UnexpectedBytesBeforeEofMarker, position)
    }

    /// [`FileErrorKind::OffsetOutOfFile`] を指定位置・記録値・ファイル長で構築する。
    pub fn offset_out_of_file_at(position: ByteOffset, value: u64, file_len: u64) -> Self {
        Self::new(FileErrorKind::OffsetOutOfFile { value, file_len }, position)
    }
}

#[cfg(test)]
mod tests;
