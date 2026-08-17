//! 暗号化辞書の解析エラー（ISO 32000-1:2008 §7.6、`docs/specs/02b_encryption.md` §2）。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。既存のモジュール専用エラー
//! （`ParseError` / `XRefError` / `TrailerError`）と同じフラット構造を採る。
//! `Display` / `std::error::Error` は実装しない（`PdfError` への変換は後続 Issue）。
//!
//! [`EncryptErrorKind::UndefinedCryptFilter`] などが [`PdfName`] を内包するため
//! `Copy` は実装しない（`Clone` のみ）。

use crate::byte_offset::ByteOffset;
use crate::encrypt::key::EncryptKey;
use crate::object::name::PdfName;

/// 暗号化辞書の解析エラーの種別。
///
/// 未対応のセキュリティハンドラ・未対応の `/V` × `/R` はここには来ない。
/// それらは「壊れている」ではなく「解釈しない」ため
/// [`EncryptDictionary::Unsupported`] として成功で返る（#604）。
///
/// [`EncryptDictionary::Unsupported`]: crate::encrypt::EncryptDictionary::Unsupported
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum EncryptErrorKind {
    /// 必須キーが辞書に無い。
    MissingRequiredKey {
        /// 欠落しているキー。
        key: EncryptKey,
    },
    /// キーの値が期待した型ではない。
    InvalidKeyType {
        /// 対象のキー。
        key: EncryptKey,
        /// 実際に読み取った値の種別ラベル（`PdfObject` のバリアント名）。
        actual_kind: &'static str,
    },
    /// `/Length` が仕様の範囲外（40..=128 かつ 8 の倍数でない）。
    InvalidKeyLength {
        /// 実際に書かれていた値。
        value: i64,
    },
    /// `/V 4` 以降なのに `/CF` が無い。
    MissingCryptFilters,
    /// `/StmF` `/StrF` `/EFF` が `/CF` に存在しない名前を指している。
    UndefinedCryptFilter {
        /// 参照元のキー。
        key: EncryptKey,
        /// 解決できなかった crypt filter 名。
        name: PdfName,
    },
    /// `/CFM` が既知の値（`/None` `/V2` `/AESV2` `/AESV3`）でない。
    UnknownCryptFilterMethod {
        /// 実際に書かれていた方式名。
        name: PdfName,
    },
    /// `/P` が 32 ビット整数（符号付き・符号なしのいずれ）にも収まらない。
    InvalidPermissions {
        /// 実際に書かれていた値。
        value: i64,
    },
}

/// 暗号化辞書の解析エラー。位置情報を必須で保持する。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct EncryptError {
    kind: EncryptErrorKind,
    position: ByteOffset,
}

impl EncryptError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: EncryptErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// エラーの種別を返す。
    #[must_use]
    pub fn kind(&self) -> &EncryptErrorKind {
        &self.kind
    }

    /// エラー発生位置（ファイル先頭からのバイトオフセット）を返す。
    pub fn position(&self) -> ByteOffset {
        self.position
    }

    /// 種別を所有権ごと取り出す。
    ///
    /// 上位のエラー（`TrailerErrorKind::EncryptDictionaryInvalid`）へ内包する際に、
    /// `PdfName` を含む種別を clone せずに移送するために使う。
    #[must_use]
    pub fn into_kind(self) -> EncryptErrorKind {
        self.kind
    }

    /// [`EncryptErrorKind::MissingRequiredKey`] を指定位置・キーで構築する。
    pub fn missing_required_key_at(position: ByteOffset, key: EncryptKey) -> Self {
        Self::new(EncryptErrorKind::MissingRequiredKey { key }, position)
    }

    /// [`EncryptErrorKind::InvalidKeyType`] を指定位置・キー・実種別で構築する。
    pub fn invalid_key_type_at(
        position: ByteOffset,
        key: EncryptKey,
        actual_kind: &'static str,
    ) -> Self {
        Self::new(
            EncryptErrorKind::InvalidKeyType { key, actual_kind },
            position,
        )
    }

    /// [`EncryptErrorKind::InvalidKeyLength`] を指定位置・実値で構築する。
    pub fn invalid_key_length_at(position: ByteOffset, value: i64) -> Self {
        Self::new(EncryptErrorKind::InvalidKeyLength { value }, position)
    }

    /// [`EncryptErrorKind::MissingCryptFilters`] を指定位置で構築する。
    pub fn missing_crypt_filters_at(position: ByteOffset) -> Self {
        Self::new(EncryptErrorKind::MissingCryptFilters, position)
    }

    /// [`EncryptErrorKind::UndefinedCryptFilter`] を指定位置・キー・名前で構築する。
    pub fn undefined_crypt_filter_at(position: ByteOffset, key: EncryptKey, name: PdfName) -> Self {
        Self::new(
            EncryptErrorKind::UndefinedCryptFilter { key, name },
            position,
        )
    }

    /// [`EncryptErrorKind::UnknownCryptFilterMethod`] を指定位置・方式名で構築する。
    pub fn unknown_crypt_filter_method_at(position: ByteOffset, name: PdfName) -> Self {
        Self::new(
            EncryptErrorKind::UnknownCryptFilterMethod { name },
            position,
        )
    }

    /// [`EncryptErrorKind::InvalidPermissions`] を指定位置・実値で構築する。
    pub fn invalid_permissions_at(position: ByteOffset, value: i64) -> Self {
        Self::new(EncryptErrorKind::InvalidPermissions { value }, position)
    }
}

#[cfg(test)]
mod tests;
