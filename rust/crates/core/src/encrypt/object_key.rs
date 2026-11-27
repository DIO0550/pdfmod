//! 文字列とストリームの crypt filter 選択と復号鍵の導出。
//! ISO 32000-1:2008 §7.6.2 Algorithm 1、ISO 32000-2:2020 §7.6 Algorithm 1.A。

use std::fmt;

use crate::encrypt::aes::{Aes, AesCbcError};
use crate::encrypt::aes256_key::Aes256FileKey;
use crate::encrypt::algorithm::StandardAlgorithm;
use crate::encrypt::auth::{AuthenticatedFileKey, FileEncryptionKey};
use crate::encrypt::crypt_filter::{CryptFilter, CryptFilterMethod};
use crate::encrypt::legacy_key::LegacyFileKey;
use crate::encrypt::md5::{Md5, DIGEST_LEN};
use crate::encrypt::rc4::Rc4;
use crate::object::object_id::ObjectId;

const AES128_KEY_LEN: usize = 16;
const AES128_KEY_SALT: &[u8; 4] = b"sAlT";

/// 暗号化対象となる値の種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncryptedValueKind {
    /// 文字列。間接オブジェクト内の辞書や配列に含まれる文字列も該当する。
    String,
    /// ストリーム本体のバイト列。crypt filter を使う文書では既定の `/StmF` を選ぶ。
    /// 明示的な `/Crypt` や埋め込みファイル用の `/EFF` が適用される場合は呼び出し側で扱う。
    Stream,
}

/// 値を収めるオブジェクトと、その格納形態。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObjectDecryptionTarget {
    /// ファイルに直接記録された間接オブジェクト内の値。
    Indirect {
        /// 文字列またはストリームを所有する間接オブジェクトの識別子。
        id: ObjectId,
        /// `/StrF` または `/StmF` を選ぶための値の種類。
        kind: EncryptedValueKind,
    },
    /// `/ObjStm` に格納された値。復号はコンテナのストリームに適用する。
    InObjectStream,
}

/// 対象へ適用する復号方式と、その方式の鍵。
#[derive(Debug)]
#[must_use]
pub enum ObjectDecryption {
    /// `/Identity`、`/CFM /None`、またはオブジェクトストリーム内の値。
    None,
    /// Algorithm 1 で導出した RC4 の鍵。
    Rc4(Rc4ObjectKey),
    /// `sAlT` を加えた Algorithm 1 で導出した AES-128 の鍵。
    Aes128(Aes128ObjectKey),
    /// Algorithm 1.A に従い、認証済みの AES-256 ファイル暗号鍵のコピーを使う。
    Aes256(Aes256FileKey),
}

impl ObjectDecryption {
    /// 文字列またはストリームの暗号化前バイト列へ復号する。
    ///
    /// `/Identity` では入力をコピーして返す。RC4 の鍵長は既に導出時に
    /// 検証されているため、不正な鍵長は通常発生しない。
    ///
    /// # Errors
    ///
    /// AES 入力の長さまたは PKCS#7 パディングが不正な場合にエラーを返す。
    pub(crate) fn decrypt(&self, input: &[u8]) -> Result<Vec<u8>, DecryptError> {
        match self {
            Self::None => Ok(input.to_vec()),
            Self::Rc4(key) => {
                let mut rc4 = Rc4::new(key.as_bytes()).ok_or(DecryptError::InvalidRc4Key)?;
                let mut plaintext = input.to_vec();
                rc4.apply(&mut plaintext);
                Ok(plaintext)
            }
            Self::Aes128(key) => Aes::new_128(key.as_bytes())
                .decrypt_pdf_cbc(input)
                .map_err(DecryptError::from),
            Self::Aes256(key) => Aes::new_256(key.as_bytes())
                .decrypt_pdf_cbc(input)
                .map_err(DecryptError::from),
        }
    }
}

/// PDF の文字列・ストリーム暗号を復号できない理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DecryptError {
    /// RC4 の導出鍵が 5〜16 バイトではない。
    InvalidRc4Key,
    /// AES の IV・暗号文が不完全。
    InvalidLength,
    /// AES の PKCS#7 パディングが不正。
    InvalidPadding,
}

impl From<AesCbcError> for DecryptError {
    fn from(error: AesCbcError) -> Self {
        match error {
            AesCbcError::InvalidLength => Self::InvalidLength,
            AesCbcError::InvalidPadding => Self::InvalidPadding,
        }
    }
}

/// 認証済み Resolver が所有する、文書ごとの復号状態。
#[derive(Debug)]
pub(crate) struct AuthenticatedObjectState {
    algorithm: StandardAlgorithm,
    key: FileEncryptionKey,
    encrypt_metadata: bool,
}

impl AuthenticatedObjectState {
    pub(super) fn new(
        algorithm: StandardAlgorithm,
        key: FileEncryptionKey,
        encrypt_metadata: bool,
    ) -> Self {
        Self {
            algorithm,
            key,
            encrypt_metadata,
        }
    }

    pub(crate) fn decrypts_metadata(&self) -> bool {
        self.encrypt_metadata
    }

    pub(crate) fn object_decryption(
        &self,
        target: ObjectDecryptionTarget,
    ) -> Result<ObjectDecryption, ObjectKeyError> {
        select_object_decryption(&self.algorithm, &self.key, target)
    }
}

/// Algorithm 1 で導出した 10〜16 バイトの RC4 鍵。
#[must_use]
pub struct Rc4ObjectKey {
    digest: [u8; DIGEST_LEN],
    length: usize,
}

impl Rc4ObjectKey {
    fn derive(file_key: &LegacyFileKey, id: ObjectId) -> Self {
        let length = file_key.as_bytes().len().saturating_add(5).min(DIGEST_LEN);
        let digest = file_key.object_key_hash(id, b"");
        Self { digest, length }
    }

    /// RC4 に渡す鍵バイト列を借用する。
    pub fn as_bytes(&self) -> &[u8] {
        &self.digest[..self.length]
    }
}

impl fmt::Debug for Rc4ObjectKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Rc4ObjectKey")
            .field("length", &self.length)
            .finish_non_exhaustive()
    }
}

/// Algorithm 1 で導出した 16 バイトの AES-128 鍵。
#[must_use]
pub struct Aes128ObjectKey([u8; AES128_KEY_LEN]);

impl Aes128ObjectKey {
    /// AES-128 に渡す 16 バイトの鍵を借用する。
    pub fn as_bytes(&self) -> &[u8; AES128_KEY_LEN] {
        &self.0
    }
}

impl fmt::Debug for Aes128ObjectKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Aes128ObjectKey")
            .finish_non_exhaustive()
    }
}

/// crypt filter に適合するファイル暗号鍵が得られない理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObjectKeyError {
    /// 選択した方式とファイル暗号鍵の種別または長さが一致しない。
    IncompatibleFileKey {
        /// 選択した暗号方式。
        method: CryptFilterMethod,
        /// ファイル暗号鍵の長さ（バイト）。
        length: usize,
    },
}

impl AuthenticatedFileKey<'_> {
    /// 認証時の暗号化辞書とファイル暗号鍵から、対象の復号方式と鍵を決定する。
    /// 戻り値は復号鍵を所有する。`/ObjStm` 内の値は復号を省略する。
    ///
    /// crypt filter を使う文書では既定の `/StrF` または `/StmF` を選ぶ。
    /// 明示的な `/Crypt` や埋め込みファイル用の `/EFF` が適用される場合は呼び出し側で扱う。
    ///
    /// # Errors
    ///
    /// 選択した方式がファイル暗号鍵の種別または長さと両立しなければ
    /// [`ObjectKeyError::IncompatibleFileKey`] を返す。
    pub fn object_decryption(
        &self,
        target: ObjectDecryptionTarget,
    ) -> Result<ObjectDecryption, ObjectKeyError> {
        select_object_decryption(self.handler().algorithm(), self.key(), target)
    }
}

fn select_object_decryption(
    algorithm: &StandardAlgorithm,
    key: &FileEncryptionKey,
    target: ObjectDecryptionTarget,
) -> Result<ObjectDecryption, ObjectKeyError> {
    let ObjectDecryptionTarget::Indirect { id, kind } = target else {
        return Ok(ObjectDecryption::None);
    };

    let method = algorithm.crypt_filter_method(kind);
    match (method, key) {
        (CryptFilterMethod::None, _) => Ok(ObjectDecryption::None),
        (CryptFilterMethod::V2, FileEncryptionKey::Legacy(key)) => {
            Ok(ObjectDecryption::Rc4(Rc4ObjectKey::derive(key, id)))
        }
        (CryptFilterMethod::AesV2, FileEncryptionKey::Legacy(key))
            if key.as_bytes().len() == AES128_KEY_LEN =>
        {
            let bytes = key.object_key_hash(id, AES128_KEY_SALT);
            Ok(ObjectDecryption::Aes128(Aes128ObjectKey(bytes)))
        }
        (CryptFilterMethod::AesV3, FileEncryptionKey::Aes256(key)) => {
            Ok(ObjectDecryption::Aes256(key.copy_for_object_decryption()))
        }
        (method, key) => Err(ObjectKeyError::IncompatibleFileKey {
            method,
            length: key.as_bytes().len(),
        }),
    }
}

impl StandardAlgorithm {
    fn crypt_filter_method(&self, kind: EncryptedValueKind) -> CryptFilterMethod {
        let filters = match self {
            Self::V1R2 | Self::V1R3 | Self::V2R3 { .. } => return CryptFilterMethod::V2,
            Self::V4R4 { crypt_filters, .. }
            | Self::V5R5 { crypt_filters, .. }
            | Self::V5R6 { crypt_filters, .. } => crypt_filters,
        };
        let selector = match kind {
            EncryptedValueKind::String => filters.string(),
            EncryptedValueKind::Stream => filters.stream(),
        };

        // 名前付きの /StrF と /StmF は解析時に存在を検証済みなので、ここでの欠落は /Identity。
        filters
            .get(selector)
            .map_or(CryptFilterMethod::None, CryptFilter::method)
    }
}

impl LegacyFileKey {
    fn object_key_hash(&self, id: ObjectId, suffix: &[u8]) -> [u8; DIGEST_LEN] {
        // Algorithm 1 は 24 ビットを超える番号でも下位 3 バイトだけを使う。
        let [low, middle, high, ..] = id.object_number().value().to_le_bytes();
        let generation = id.generation_number().value().to_le_bytes();

        let mut md5 = Md5::new();
        md5.update(self.as_bytes());
        md5.update(&[low, middle, high]);
        md5.update(&generation);
        md5.update(suffix);
        md5.finalize()
    }
}

#[cfg(test)]
mod tests;
