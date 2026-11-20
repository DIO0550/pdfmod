//! R5・R6 のファイル暗号鍵導出（ISO 32000-2:2020 §7.6.4.3 Algorithm 2.A）。

mod hash;

use std::fmt;

use self::hash::Revision;
use super::aes::Aes;
use super::algorithm::{AesKeyMaterial, StandardAlgorithm};
use super::key::EncryptKey;
use super::permissions::Permissions;
use super::standard::StandardSecurityHandler;

const ENTRY_LEN: usize = 48;
const KEY_LEN: usize = 32;
const PERMS_LEN: usize = 16;
const SALT_LEN: usize = 8;
const MAX_PASSWORD_BYTES: usize = 127;

/// 指定したパスワードに対応する辞書項目を選ぶ。
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PasswordRole {
    /// 利用者。検証には `/U`、鍵の取り出しには `/UE` を使う。
    User,
    /// 所有者。`/O` と `/OE` を使い、ハッシュには `/U` も加える。
    Owner,
}

/// パスワードと `/Perms` の検証を通過した 32 バイトのファイル暗号鍵。
#[must_use]
pub struct Aes256FileKey([u8; KEY_LEN]);

impl Aes256FileKey {
    /// ファイル暗号鍵の 32 バイトを借用する。
    #[must_use]
    pub fn as_bytes(&self) -> &[u8; KEY_LEN] {
        &self.0
    }

    fn verify_permissions(
        bytes: [u8; KEY_LEN],
        perms: &[u8; 16],
        permissions: Permissions,
        metadata: bool,
    ) -> Result<Self, Aes256FileKeyError> {
        let clear = Aes::new_256(&bytes).decrypt_ecb_block(perms);
        let [a, b, c, d] = permissions.bits().to_le_bytes();
        let flag = if metadata { b'T' } else { b'F' };
        let expected = [a, b, c, d, 0xff, 0xff, 0xff, 0xff, flag, b'a', b'd', b'b'];
        // 末尾 4 バイトは PDF 作成時の乱数なので比較しない。
        if !clear.starts_with(&expected) {
            return Err(Aes256FileKeyError::InvalidPermissions);
        }
        Ok(Self(bytes))
    }
}

impl fmt::Debug for Aes256FileKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("Aes256FileKey")
            .finish_non_exhaustive()
    }
}

/// AES-256 のファイル暗号鍵を返せない理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Aes256FileKeyError {
    /// R2〜R4 は Algorithm 2 を使う。
    UnsupportedRevision,
    /// 鍵導出に使う辞書項目の長さが不正。
    InvalidEntryLength {
        /// 長さが不正な辞書キー。
        key: EncryptKey,
        /// 実際のバイト数。
        actual: usize,
    },
    /// 指定した役割の検証ハッシュと一致しない。
    IncorrectPassword,
    /// 復号した `/Perms` の固定値・権限・メタデータフラグが辞書と一致しない。
    InvalidPermissions,
    /// SHA-2 の入力長または反復中のブロック長を扱えない。
    InvalidHashInput,
}

impl StandardSecurityHandler {
    /// 指定した役割でパスワードと権限を検証し、R5・R6 のファイル暗号鍵を返す。
    /// SASLprep は呼び出し側で行う。準備済み文字列の UTF-8 の先頭 127 バイトを使用する。
    ///
    /// # Errors
    ///
    /// 対象外の版、必要な項目の長さ不正、ハッシュ計算の失敗、パスワード・権限の不一致。
    pub fn derive_aes256_file_key(
        &self,
        role: PasswordRole,
        prepared_password: &str,
    ) -> Result<Aes256FileKey, Aes256FileKeyError> {
        let (revision, keys) = match self.algorithm() {
            StandardAlgorithm::V5R5 { keys, .. } => (Revision::R5, keys),
            StandardAlgorithm::V5R6 { keys, .. } => (Revision::R6, keys),
            StandardAlgorithm::V1R2
            | StandardAlgorithm::V1R3
            | StandardAlgorithm::V2R3 { .. }
            | StandardAlgorithm::V4R4 { .. } => {
                return Err(Aes256FileKeyError::UnsupportedRevision);
            }
        };

        let entry = PasswordEntry::from_handler(self, keys, role)?;
        let perms = fixed_entry::<PERMS_LEN>(EncryptKey::Perms, &keys.perms)?;
        let bytes = prepared_password.as_bytes();
        let password = bytes.get(..MAX_PASSWORD_BYTES).unwrap_or(bytes);
        let key = entry.unlock(revision, password)?;
        Aes256FileKey::verify_permissions(key, perms, self.permissions(), self.encrypt_metadata())
    }

    /// 指定した役割の R5・R6 認証に必要な辞書項目（`/U` `/O` `/UE` `/OE` `/Perms`）の長さを検証する。
    ///
    /// パスワード文字列の UTF-8 判定より先に構造エラーを検出するために使用する。
    pub(super) fn validate_aes256_entries(
        &self,
        role: PasswordRole,
    ) -> Result<(), Aes256FileKeyError> {
        let keys = match self.algorithm() {
            StandardAlgorithm::V5R5 { keys, .. } | StandardAlgorithm::V5R6 { keys, .. } => keys,
            StandardAlgorithm::V1R2
            | StandardAlgorithm::V1R3
            | StandardAlgorithm::V2R3 { .. }
            | StandardAlgorithm::V4R4 { .. } => {
                return Err(Aes256FileKeyError::UnsupportedRevision);
            }
        };
        let _ = PasswordEntry::from_handler(self, keys, role)?;
        let _ = fixed_entry::<PERMS_LEN>(EncryptKey::Perms, &keys.perms)?;
        Ok(())
    }
}

/// 一方の役割の検証値・暗号化ファイル鍵と、ハッシュに加える利用者情報をまとめて借りる。
struct PasswordEntry<'a> {
    value: &'a [u8; ENTRY_LEN],
    encrypted_key: &'a [u8; KEY_LEN],
    user_data: &'a [u8],
}

impl<'a> PasswordEntry<'a> {
    fn from_handler(
        handler: &'a StandardSecurityHandler,
        keys: &'a AesKeyMaterial,
        role: PasswordRole,
    ) -> Result<Self, Aes256FileKeyError> {
        let user = fixed_entry(EncryptKey::U, handler.user_key())?;
        match role {
            PasswordRole::User => Ok(Self {
                value: user,
                encrypted_key: fixed_entry(EncryptKey::UE, &keys.user_encrypted_key)?,
                user_data: &[],
            }),
            PasswordRole::Owner => Ok(Self {
                value: fixed_entry(EncryptKey::O, handler.owner_key())?,
                encrypted_key: fixed_entry(EncryptKey::OE, &keys.owner_encrypted_key)?,
                user_data: user,
            }),
        }
    }

    fn unlock(
        &self,
        revision: Revision,
        password: &[u8],
    ) -> Result<[u8; KEY_LEN], Aes256FileKeyError> {
        let (expected, salts) = self.value.split_at(KEY_LEN);
        let (validation_salt, key_salt) = salts.split_at(SALT_LEN);
        let validation = revision.hash(password, validation_salt, self.user_data)?;
        let mismatch = validation
            .iter()
            .zip(expected)
            .fold(0, |diff, (a, b)| diff | (a ^ b));
        if mismatch != 0 {
            return Err(Aes256FileKeyError::IncorrectPassword);
        }

        let wrapping_key = revision.hash(password, key_salt, self.user_data)?;
        let mut key = *self.encrypted_key;
        let (blocks, _) = key.as_chunks_mut::<16>();
        Aes::new_256(&wrapping_key).decrypt_cbc_blocks(&[0; 16], blocks);
        Ok(key)
    }
}

fn fixed_entry<const N: usize>(
    key: EncryptKey,
    bytes: &[u8],
) -> Result<&[u8; N], Aes256FileKeyError> {
    bytes
        .try_into()
        .map_err(|_| Aes256FileKeyError::InvalidEntryLength {
            key,
            actual: bytes.len(),
        })
}

#[cfg(test)]
mod tests;
