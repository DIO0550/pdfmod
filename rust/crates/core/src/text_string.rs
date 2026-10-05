//! テキスト文字列の符号化を BOM で判別し、Unicode に復元する（ISO 32000 §7.9.2.2）。
//! 字句のエスケープ解決・暗号化の復号後に、テキスト用途と分かっている値へ明示的に使う。

pub mod error;
mod pdf_doc_encoding;

use std::fmt;

use error::{TextDecodeError, TextDecodeErrorKind};

/// 不正な符号列・未割当バイトの取り扱い。置換はライブラリ独自の回復方針。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecodePolicy {
    /// 最初の不正箇所でエラーを返し、部分文字列を返さない。
    Strict,
    /// 不正箇所を U+FFFD に置換し、後続の正常文字を保持する。
    Replace,
}

impl DecodePolicy {
    fn recover(self, kind: TextDecodeErrorKind, offset: usize) -> Result<char, TextDecodeError> {
        match self {
            Self::Strict => Err(TextDecodeError::new(kind, offset)),
            Self::Replace => Ok(char::REPLACEMENT_CHARACTER),
        }
    }
}

/// PDF のテキスト用途のバイト列を明示的にデコードした Unicode 文字列。
/// 内部は妥当な UTF-8。言語指定エスケープの除去・Unicode 正規化は行わない。
///
/// ```
/// use pdfmod_core::{object::PdfString, text_string::{DecodePolicy, PdfTextString}};
/// let raw = PdfString::hex(b"\xFE\xFF\x65\xE5\x67\x2C");
/// let text = PdfTextString::decode(raw.as_bytes(), DecodePolicy::Strict)?;
/// let value: String = text.into();
/// assert_eq!(value, "日本");
/// # Ok::<(), pdfmod_core::text_string::error::TextDecodeError>(())
/// ```
///
/// バイト文字列を暗黙にテキスト扱いする変換は提供しない。
/// ```compile_fail
/// use pdfmod_core::{object::PdfString, text_string::PdfTextString};
/// let text: PdfTextString = PdfString::literal(b"binary").into();
/// ```
#[derive(Debug, PartialEq, Eq)]
pub struct PdfTextString(String);

impl PdfTextString {
    /// UTF-8 BOM、UTF-16BE BOM、その他の PDFDocEncoding の順に判別する。
    /// Strict では不正入力をエラーにし、Replace では U+FFFD に置換する。
    /// PDF バージョンの検証は呼び出し側が行う。UTF-16LE や BOM なし UTF-8 は推測しない。
    pub fn decode(bytes: &[u8], policy: DecodePolicy) -> Result<Self, TextDecodeError> {
        if let Some(payload) = bytes.strip_prefix(b"\xEF\xBB\xBF") {
            return Self::decode_utf8(payload, policy);
        }
        if let Some(payload) = bytes.strip_prefix(b"\xFE\xFF") {
            return Self::decode_utf16be(payload, policy);
        }
        pdf_doc_encoding::PdfDocEncoding::decode(bytes, policy).map(Self)
    }

    /// デコード済み文字列を借用する。
    pub fn as_str(&self) -> &str {
        &self.0
    }

    fn decode_utf8(bytes: &[u8], policy: DecodePolicy) -> Result<Self, TextDecodeError> {
        match policy {
            DecodePolicy::Strict => std::str::from_utf8(bytes)
                .map(|text| Self(text.to_owned()))
                .map_err(|error| {
                    TextDecodeError::new(
                        TextDecodeErrorKind::InvalidUtf8(error),
                        3usize.saturating_add(error.valid_up_to()),
                    )
                }),
            DecodePolicy::Replace => Ok(Self(String::from_utf8_lossy(bytes).into_owned())),
        }
    }

    fn decode_utf16be(bytes: &[u8], policy: DecodePolicy) -> Result<Self, TextDecodeError> {
        // 2 バイト境界で読む。サロゲートの結合と不正単位の消費は標準ライブラリに委譲する。
        let (pairs, remainder) = bytes.as_chunks::<2>();
        let units = pairs.iter().map(|pair| u16::from_be_bytes(*pair));
        let mut text = String::new();
        let mut offset = 2usize;
        for decoded in char::decode_utf16(units) {
            match decoded {
                Ok(ch) => {
                    text.push(ch);
                    offset = offset.saturating_add(ch.len_utf16().saturating_mul(2));
                }
                Err(error) => {
                    text.push(policy.recover(
                        TextDecodeErrorKind::UnpairedSurrogate {
                            unit: error.unpaired_surrogate(),
                        },
                        offset,
                    )?);
                    offset = offset.saturating_add(2);
                }
            }
        }
        if !remainder.is_empty() {
            text.push(policy.recover(TextDecodeErrorKind::OddUtf16Length, offset)?);
        }
        Ok(Self(text))
    }
}

impl From<PdfTextString> for String {
    fn from(text: PdfTextString) -> Self {
        text.0
    }
}

impl fmt::Display for PdfTextString {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

#[cfg(test)]
mod tests;
