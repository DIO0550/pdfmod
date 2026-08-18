//! 暗号化辞書（`/Encrypt`）の型表現（ISO 32000-1:2008 §7.6 / ISO 32000-2:2020 §7.6、
//! `docs/specs/02b_encryption.md` §1）。
//!
//! `/Filter /Standard` の暗号化辞書のみを型として解釈し、`/V` と `/R` の
//! 取りうる組み合わせだけを [`StandardAlgorithm`] のバリアントで表現する。
//!
//! # スコープ外（#604）
//!
//! - 復号処理そのもの（RC4 / AES による文字列・ストリームの復号）
//! - 鍵導出・パスワード認証（`/O` `/U` からの検証）
//! - 公開鍵ハンドラ `/Adobe.PubSec` 固有キー（`/Recipients` `/SubFilter`）の解釈
//! - 暗号化辞書の中に書かれた間接参照の解決（`/Length 5 0 R` など）
//!
//! 未対応のセキュリティハンドラ・未対応の `/V` は [`EncryptDictionary::Unsupported`]
//! として生の [`PdfDictionary`] を保持したまま運ぶ。解析全体は失敗させない。
//!
//! [`StandardAlgorithm`]: algorithm::StandardAlgorithm

pub mod algorithm;
pub mod crypt_filter;
pub mod error;
pub mod key;
pub mod permissions;
pub mod standard;

use crate::byte_offset::ByteOffset;
use crate::encrypt::algorithm::AlgorithmKind;
use crate::encrypt::error::EncryptError;
use crate::encrypt::key::EncryptKey;
use crate::encrypt::standard::StandardSecurityHandler;
use crate::object::dictionary::PdfDictionary;
use crate::object::name::PdfName;
use crate::object::pdf_object::PdfObject;

/// 標準セキュリティハンドラを示す `/Filter` の値。
const STANDARD_FILTER: &[u8] = b"Standard";

/// 暗号化辞書。`/Filter` が `/Standard` のものだけを型として解釈する。
///
/// `PdfDictionary` が `Eq` 非実装のため、本 enum も `PartialEq` のみ。
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub enum EncryptDictionary {
    /// 標準セキュリティハンドラ（`/Filter /Standard`）。
    Standard(StandardSecurityHandler),
    /// 未対応のセキュリティハンドラ、または未対応の `/V` × `/R` 組み合わせ。
    ///
    /// 解析を止めないため、元の辞書を無傷のまま保持する（#604）。
    Unsupported {
        /// `/Filter` の値。`raw` にも同じ値が残っている（利用側の利便のための複製）。
        filter: PdfName,
        /// 解釈前の暗号化辞書そのもの。
        raw: PdfDictionary,
    },
}

impl EncryptDictionary {
    /// 暗号化辞書を型に変換する。
    ///
    /// `/Filter` が `/Standard` 以外、あるいは `/V` × `/R` が対応外の組み合わせの場合は
    /// [`Self::Unsupported`] を返す（エラーにはしない）。
    ///
    /// # Errors
    ///
    /// - [`EncryptErrorKind::MissingRequiredKey`] — `/Filter` `/V` `/R` および
    ///   Standard ハンドラの必須キー（`/O` `/U` `/P`、`/R 5` `/R 6` では
    ///   `/OE` `/UE` `/Perms`）が無い
    /// - [`EncryptErrorKind::InvalidKeyType`] — キーの値の型が仕様と異なる
    /// - [`EncryptErrorKind::InvalidKeyLength`] — `/Length` が仕様の範囲外
    /// - [`EncryptErrorKind::MissingCryptFilters`] — `/V 4` 以降で `/CF` が無い
    /// - [`EncryptErrorKind::UndefinedCryptFilter`] — `/StmF` `/StrF` `/EFF` が
    ///   `/CF` に存在しない名前を指している
    /// - [`EncryptErrorKind::UnknownCryptFilterMethod`] — `/CFM` が既知の値でない
    /// - [`EncryptErrorKind::InvalidPermissions`] — `/P` が 32 ビット整数に収まらない
    ///
    /// [`EncryptErrorKind::MissingRequiredKey`]: error::EncryptErrorKind::MissingRequiredKey
    /// [`EncryptErrorKind::InvalidKeyType`]: error::EncryptErrorKind::InvalidKeyType
    /// [`EncryptErrorKind::InvalidKeyLength`]: error::EncryptErrorKind::InvalidKeyLength
    /// [`EncryptErrorKind::MissingCryptFilters`]: error::EncryptErrorKind::MissingCryptFilters
    /// [`EncryptErrorKind::UndefinedCryptFilter`]: error::EncryptErrorKind::UndefinedCryptFilter
    /// [`EncryptErrorKind::UnknownCryptFilterMethod`]: error::EncryptErrorKind::UnknownCryptFilterMethod
    /// [`EncryptErrorKind::InvalidPermissions`]: error::EncryptErrorKind::InvalidPermissions
    pub fn from_dictionary(
        dictionary: PdfDictionary,
        position: ByteOffset,
    ) -> Result<Self, EncryptError> {
        // /Filter は Unsupported に倒すときにも必要なので、ここで所有権を得ておく。
        // 値は "/Standard" 程度の短い名前で、暗号化辞書は 1 ドキュメントに 1 個のため
        // clone のコストは無視できる。
        let filter = expect_name(&dictionary, EncryptKey::Filter, position)?.clone();

        if filter.as_bytes() != STANDARD_FILTER {
            return Ok(Self::Unsupported {
                filter,
                raw: dictionary,
            });
        }

        // /V /R は i64（Copy）なので借用で覗く。ここで remove すると
        // Unsupported に倒したときに raw が欠けた辞書になる。
        let version = expect_integer(&dictionary, EncryptKey::V, position)?;
        let revision = expect_integer(&dictionary, EncryptKey::R, position)?;

        let Some(kind) = AlgorithmKind::from_version_revision(version, revision) else {
            return Ok(Self::Unsupported {
                filter,
                raw: dictionary,
            });
        };

        let handler = StandardSecurityHandler::from_dictionary(kind, dictionary, position)?;
        Ok(Self::Standard(handler))
    }

    /// 標準セキュリティハンドラとして解釈できている場合にその内容を返す。
    pub fn as_standard(&self) -> Option<&StandardSecurityHandler> {
        match self {
            Self::Standard(handler) => Some(handler),
            Self::Unsupported { .. } => None,
        }
    }
}

/// 必須キーを Name として借用で取り出す。
fn expect_name(
    dictionary: &PdfDictionary,
    key: EncryptKey,
    position: ByteOffset,
) -> Result<&PdfName, EncryptError> {
    let Some(value) = dictionary.get(key.as_bytes()) else {
        return Err(EncryptError::missing_required_key_at(position, key));
    };
    value
        .as_name()
        .ok_or_else(|| EncryptError::invalid_key_type_at(position, key, value.kind_label()))
}

/// 必須キーを Integer として借用で取り出す。
fn expect_integer(
    dictionary: &PdfDictionary,
    key: EncryptKey,
    position: ByteOffset,
) -> Result<i64, EncryptError> {
    let Some(value) = dictionary.get(key.as_bytes()) else {
        return Err(EncryptError::missing_required_key_at(position, key));
    };
    value
        .as_integer()
        .ok_or_else(|| EncryptError::invalid_key_type_at(position, key, value.kind_label()))
}

/// 任意キーを Integer として取り出す（辞書からは除去される）。
fn take_optional_integer(
    dictionary: &mut PdfDictionary,
    key: EncryptKey,
    position: ByteOffset,
) -> Result<Option<i64>, EncryptError> {
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Ok(None);
    };
    value
        .as_integer()
        .map(Some)
        .ok_or_else(|| EncryptError::invalid_key_type_at(position, key, value.kind_label()))
}

/// 必須キーを String（バイト列）として取り出す（辞書からは除去される）。
fn take_required_bytes(
    dictionary: &mut PdfDictionary,
    key: EncryptKey,
    position: ByteOffset,
) -> Result<Vec<u8>, EncryptError> {
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Err(EncryptError::missing_required_key_at(position, key));
    };
    match value {
        PdfObject::String(bytes) => Ok(bytes),
        other => Err(EncryptError::invalid_key_type_at(
            position,
            key,
            other.kind_label(),
        )),
    }
}

/// 任意キーを Boolean として取り出す（辞書からは除去される）。既定値は呼び出し側が与える。
fn take_optional_bool(
    dictionary: &mut PdfDictionary,
    key: EncryptKey,
    position: ByteOffset,
) -> Result<Option<bool>, EncryptError> {
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Ok(None);
    };
    value
        .as_bool()
        .map(Some)
        .ok_or_else(|| EncryptError::invalid_key_type_at(position, key, value.kind_label()))
}

#[cfg(test)]
mod tests;
