//! テキスト復元の失敗理由と、入力文字列内のバイト位置。

use std::{fmt, str::Utf8Error};

/// テキスト文字列内のゼロ起点バイト位置。先頭 BOM を含み、PDF ファイル位置とは異なる。
/// 値自体は無検証で、デコーダーが入力内の不正箇所から構築する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct TextStringOffset(usize);

impl TextStringOffset {
    /// BOM を含む入力バイト列内の位置を返す。
    pub fn value(self) -> usize {
        self.0
    }
}

/// テキスト文字列を復元できなかった理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TextDecodeErrorKind {
    /// PDFDocEncoding の未割当バイト。
    UndefinedPdfDocByte {
        /// 未割当の値。
        byte: u8,
    },
    /// UTF-8 として不正（BOM を除いた部分に対する標準ライブラリの診断）。
    InvalidUtf8(Utf8Error),
    /// UTF-16 の孤立した上位・下位サロゲート。
    UnpairedSurrogate {
        /// 対応する相手がいない UTF-16 コード単位。
        unit: u16,
    },
    /// UTF-16BE の末尾に 1 バイトが余った。
    OddUtf16Length,
}

/// 最初の不正箇所。位置は字句エスケープ解決後のバイト列内で、ファイル上の位置ではない。
#[derive(Debug, PartialEq, Eq)]
pub struct TextDecodeError {
    kind: TextDecodeErrorKind,
    offset: TextStringOffset,
}

impl TextDecodeError {
    pub(super) fn new(kind: TextDecodeErrorKind, offset: usize) -> Self {
        Self {
            kind,
            offset: TextStringOffset(offset),
        }
    }

    /// 失敗の分類と不正値。
    pub fn kind(&self) -> TextDecodeErrorKind {
        self.kind
    }

    /// BOM を含む入力の最初の不正バイト位置。
    pub fn offset(&self) -> TextStringOffset {
        self.offset
    }
}

impl fmt::Display for TextDecodeError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "text string decode failed at byte {}: ", self.offset.0)?;
        match self.kind {
            TextDecodeErrorKind::UndefinedPdfDocByte { byte } => {
                write!(f, "undefined PDFDocEncoding byte 0x{byte:02X}")
            }
            TextDecodeErrorKind::InvalidUtf8(error) => fmt::Display::fmt(&error, f),
            TextDecodeErrorKind::UnpairedSurrogate { unit } => {
                write!(f, "unpaired surrogate 0x{unit:04X}")
            }
            TextDecodeErrorKind::OddUtf16Length => f.write_str("trailing byte in UTF-16BE"),
        }
    }
}

impl std::error::Error for TextDecodeError {}
