//! PDF のバージョン `x.y` を表す `PdfVersion` を定義するモジュール。
//!
//! ISO 32000-1:2008 が 1.0〜1.7 を、ISO 32000-2:2020 が 2.0 を規定する
//! （`docs/specs/02_file_structure.md` §2.1）。それ以外の版は受理しない。

use std::fmt;

/// PDF のバージョン。ISO が規定する 9 種のみを表現できる。
///
/// バリアントの宣言順が版の昇順と一致するため、導出した順序比較がそのまま版の
/// 新旧比較になる。カタログの `/Version` による上書き判定は後続フェーズで実装する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
#[must_use]
pub enum PdfVersion {
    /// PDF 1.0（ISO 32000-1）。
    V1_0,
    /// PDF 1.1（ISO 32000-1）。
    V1_1,
    /// PDF 1.2（ISO 32000-1）。
    V1_2,
    /// PDF 1.3（ISO 32000-1）。
    V1_3,
    /// PDF 1.4（ISO 32000-1）。
    V1_4,
    /// PDF 1.5（ISO 32000-1）。
    V1_5,
    /// PDF 1.6（ISO 32000-1）。
    V1_6,
    /// PDF 1.7（ISO 32000-1）。
    V1_7,
    /// PDF 2.0（ISO 32000-2）。
    V2_0,
}

impl PdfVersion {
    /// バージョン表記のバイト列（`b"1.7"` など）から `PdfVersion` を得る。
    ///
    /// ISO が規定しない版・形式不正は `None` を返す。
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        match bytes {
            b"1.0" => Some(Self::V1_0),
            b"1.1" => Some(Self::V1_1),
            b"1.2" => Some(Self::V1_2),
            b"1.3" => Some(Self::V1_3),
            b"1.4" => Some(Self::V1_4),
            b"1.5" => Some(Self::V1_5),
            b"1.6" => Some(Self::V1_6),
            b"1.7" => Some(Self::V1_7),
            b"2.0" => Some(Self::V2_0),
            _ => None,
        }
    }

    /// `"1.7"` のような版表記を返す。
    #[must_use]
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::V1_0 => "1.0",
            Self::V1_1 => "1.1",
            Self::V1_2 => "1.2",
            Self::V1_3 => "1.3",
            Self::V1_4 => "1.4",
            Self::V1_5 => "1.5",
            Self::V1_6 => "1.6",
            Self::V1_7 => "1.7",
            Self::V2_0 => "2.0",
        }
    }
}

/// 版表記のみを出力する（`"1.7"`。`%PDF-` などの装飾は付けない）。
impl fmt::Display for PdfVersion {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.as_str(), f)
    }
}

#[cfg(test)]
mod tests;
