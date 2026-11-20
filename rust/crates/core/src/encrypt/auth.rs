//! R2〜R6 のパスワード認証（ISO 32000-1:2008 §7.6.3.4 Algorithm 6 / 7、
//! ISO 32000-2:2020 §7.6.4.4 Algorithm 11 / 12、`docs/specs/02b_encryption.md` §13）。

use std::fmt;

pub use crate::encrypt::aes256_key::PasswordRole;
use crate::encrypt::aes256_key::{Aes256FileKey, Aes256FileKeyError};
use crate::encrypt::algorithm::{KeyLength, StandardAlgorithm};
use crate::encrypt::key::EncryptKey;
use crate::encrypt::legacy_key::{
    padded_password, LegacyFileKey, LegacyFileKeyError, PADDED_PASSWORD_LEN, PASSWORD_PADDING,
    REHASH_COUNT,
};
use crate::encrypt::md5::{Md5, DIGEST_LEN};
use crate::encrypt::rc4::Rc4;
use crate::encrypt::standard::StandardSecurityHandler;
use crate::xref::trailer::file_id::FileId;

const RC4_ROUND_COUNT: u8 = 20;
const LEGACY_R3_USER_COMPARE_LEN: usize = 16;

/// 検証済みのファイル暗号鍵。
///
/// R2〜R4 は 5〜16 バイトの [`LegacyFileKey`]、R5・R6 は 32 バイトの
/// [`Aes256FileKey`] を保持する。両バリアントとも `Debug` で鍵バイト列を出力しない。
#[derive(Debug)]
#[must_use]
pub enum FileEncryptionKey {
    /// R2〜R4 のファイル暗号鍵（5〜16 バイト）。
    Legacy(LegacyFileKey),
    /// R5・R6 のファイル暗号鍵（32 バイト）。
    Aes256(Aes256FileKey),
}

impl FileEncryptionKey {
    /// ファイル暗号鍵をバイト列で返す。
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::Legacy(key) => key.as_bytes(),
            Self::Aes256(key) => key.as_bytes(),
        }
    }

    /// R2〜R4 のファイル暗号鍵であればその参照を返す。
    #[must_use]
    pub fn as_legacy(&self) -> Option<&LegacyFileKey> {
        match self {
            Self::Legacy(key) => Some(key),
            Self::Aes256(_) => None,
        }
    }

    /// R5・R6 のファイル暗号鍵であればその参照を返す。
    #[must_use]
    pub fn as_aes256(&self) -> Option<&Aes256FileKey> {
        match self {
            Self::Legacy(_) => None,
            Self::Aes256(key) => Some(key),
        }
    }
}

/// パスワード認証（Algorithm 6 / 7 / 11 / 12）を通過したファイル暗号鍵と役割。
///
/// 構築経路は [`StandardSecurityHandler::authenticate`] と
/// [`StandardSecurityHandler::authenticate_as`] のみに限定し、
/// 未認証または誤った鍵のまま復号へ進めないことを型で保証する。
#[must_use]
pub struct AuthenticatedFileKey {
    key: FileEncryptionKey,
    role: PasswordRole,
}

impl AuthenticatedFileKey {
    /// 認証に成功した役割（利用者または所有者）を返す。
    #[must_use]
    pub fn role(&self) -> PasswordRole {
        self.role
    }

    /// 検証済みのファイル暗号鍵をアルゴリズム種別付きで返す。
    pub fn key(&self) -> &FileEncryptionKey {
        &self.key
    }

    /// 検証済みのファイル暗号鍵をバイト列で返す。
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        self.key.as_bytes()
    }
}

impl fmt::Debug for AuthenticatedFileKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("AuthenticatedFileKey")
            .field("role", &self.role)
            .field("key", &self.key)
            .finish_non_exhaustive()
    }
}

/// パスワード認証に失敗した理由。
///
/// パスワード不一致（[`Self::IncorrectPassword`]）と、暗号化辞書・トレイラの構造不正や
/// 改ざんによる失敗をバリアントで区別する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthError {
    /// 指定したパスワード（未指定時は空パスワード）が認証に一致しない。
    IncorrectPassword,
    /// R2〜R4 の認証に必要なトレイラの `/ID` が欠けている。
    MissingFileId,
    /// 認証に使う暗号化辞書のバイト列項目（`/O` `/U` `/OE` `/UE` `/Perms`）の長さが仕様と異なる。
    InvalidEntryLength {
        /// 長さが不正な辞書キー。
        key: EncryptKey,
        /// 実際のバイト数。
        actual: usize,
    },
    /// R2〜R4 の鍵長が RC4・MD5 の範囲（5〜16 バイト）に収まらない。
    InvalidKeyLength {
        /// アルゴリズムが指定する鍵長。
        length: KeyLength,
    },
    /// R5・R6 で復号した `/Perms` の固定値・権限・メタデータフラグが辞書と一致しない。
    InvalidPermissions,
    /// R5・R6 の SHA-2 入力長または反復ブロック長を扱えない。
    InvalidHashInput,
    /// 対応外のアルゴリズム版・リビジョンが渡された。
    UnsupportedRevision,
}

impl AuthError {
    fn from_legacy_error(error: LegacyFileKeyError) -> Self {
        match error {
            LegacyFileKeyError::UnsupportedRevision => Self::UnsupportedRevision,
            LegacyFileKeyError::MissingFileId => Self::MissingFileId,
            LegacyFileKeyError::InvalidOwnerEntryLength { actual } => Self::InvalidEntryLength {
                key: EncryptKey::O,
                actual,
            },
            LegacyFileKeyError::InvalidKeyLength { length } => Self::InvalidKeyLength { length },
        }
    }

    fn from_aes256_error(error: Aes256FileKeyError) -> Self {
        match error {
            Aes256FileKeyError::UnsupportedRevision => Self::UnsupportedRevision,
            Aes256FileKeyError::InvalidEntryLength { key, actual } => {
                Self::InvalidEntryLength { key, actual }
            }
            Aes256FileKeyError::IncorrectPassword => Self::IncorrectPassword,
            Aes256FileKeyError::InvalidPermissions => Self::InvalidPermissions,
            Aes256FileKeyError::InvalidHashInput => Self::InvalidHashInput,
        }
    }
}

#[derive(Clone, Copy)]
enum LegacyRevision {
    R2,
    R3OrR4,
}

impl StandardSecurityHandler {
    /// パスワードを認証し、検証済みのファイル暗号鍵と役割を返す
    /// （Algorithm 6 / 7 / 11 / 12）。
    ///
    /// - `password` が `None` のときは空パスワード（`b""`）を **利用者 → 所有者** の順に試す。
    /// - `password` が `Some(bytes)` のときは指定バイト列を **所有者 → 利用者** の順に試す
    ///   （ISO 32000-1 §7.6.3.1 / ISO 32000-2 §7.6.4.1）。
    /// - R2〜R4 は `file_id`（トレイラの `/ID`）を必要とする。R5・R6 は `file_id` を使わず、
    ///   パスワードを準備済み UTF-8 として検証する（不正な UTF-8 は [`AuthError::IncorrectPassword`]）。
    ///
    /// # Errors
    ///
    /// パスワード不一致（[`AuthError::IncorrectPassword`]）、`/ID` の欠落、辞書項目の長さ不正、
    /// 鍵長の範囲外、`/Perms` の不一致、ハッシュ入力不正。
    pub fn authenticate(
        &self,
        password: Option<&[u8]>,
        file_id: Option<&FileId>,
    ) -> Result<AuthenticatedFileKey, AuthError> {
        let (bytes, roles) = match password {
            // パスワード未指定時は空パスワードを利用者 → 所有者の順に試し、
            // 利用者・所有者ともに空の文書でも /P の権限制限を優先する。
            None => (b"".as_slice(), [PasswordRole::User, PasswordRole::Owner]),
            // 明示指定時は ISO 32000-1 §7.6.3.1 / ISO 32000-2 §7.6.4.1 に従い
            // 所有者 → 利用者の順に試す（同一パスワード設定時に所有者権限を優先）。
            Some(bytes) => (bytes, [PasswordRole::Owner, PasswordRole::User]),
        };

        for role in roles {
            match self.authenticate_as(role, bytes, file_id) {
                Ok(authenticated) => return Ok(authenticated),
                Err(AuthError::IncorrectPassword) => continue,
                Err(error) => return Err(error),
            }
        }

        Err(AuthError::IncorrectPassword)
    }

    /// 指定した役割でパスワードを認証し、検証済みのファイル暗号鍵を返す。
    ///
    /// R2〜R4 の [`PasswordRole::User`] は Algorithm 6、[`PasswordRole::Owner`] は Algorithm 7、
    /// R5・R6 の [`PasswordRole::User`] は Algorithm 11、[`PasswordRole::Owner`] は Algorithm 12 を
    /// 適用する。
    ///
    /// # Errors
    ///
    /// パスワード不一致（[`AuthError::IncorrectPassword`]）、`/ID` の欠落、辞書項目の長さ不正、
    /// 鍵長の範囲外、`/Perms` の不一致、ハッシュ入力不正。
    pub fn authenticate_as(
        &self,
        role: PasswordRole,
        password: &[u8],
        file_id: Option<&FileId>,
    ) -> Result<AuthenticatedFileKey, AuthError> {
        match self.algorithm() {
            StandardAlgorithm::V1R2 => {
                self.authenticate_legacy(LegacyRevision::R2, role, password, file_id)
            }
            StandardAlgorithm::V1R3
            | StandardAlgorithm::V2R3 { .. }
            | StandardAlgorithm::V4R4 { .. } => {
                self.authenticate_legacy(LegacyRevision::R3OrR4, role, password, file_id)
            }
            StandardAlgorithm::V5R5 { .. } | StandardAlgorithm::V5R6 { .. } => {
                self.authenticate_aes256(role, password)
            }
        }
    }

    fn authenticate_legacy(
        &self,
        revision: LegacyRevision,
        role: PasswordRole,
        password: &[u8],
        file_id: Option<&FileId>,
    ) -> Result<AuthenticatedFileKey, AuthError> {
        let file_id = file_id.ok_or(AuthError::MissingFileId)?;
        let owner_entry = fixed_legacy_entry(EncryptKey::O, self.owner_key())?;
        let user_entry = fixed_legacy_entry(EncryptKey::U, self.user_key())?;

        let key = match role {
            PasswordRole::User => self.authenticate_legacy_padded_user(
                revision,
                &padded_password(password),
                user_entry,
                file_id,
            )?,
            PasswordRole::Owner => self.authenticate_legacy_owner(
                revision,
                password,
                owner_entry,
                user_entry,
                file_id,
            )?,
        };

        Ok(AuthenticatedFileKey {
            key: FileEncryptionKey::Legacy(key),
            role,
        })
    }

    fn authenticate_legacy_padded_user(
        &self,
        revision: LegacyRevision,
        padded_user: &[u8; PADDED_PASSWORD_LEN],
        user_entry: &[u8; PADDED_PASSWORD_LEN],
        file_id: &FileId,
    ) -> Result<LegacyFileKey, AuthError> {
        let file_key = self
            .derive_legacy_file_key_from_padded(padded_user, Some(file_id))
            .map_err(AuthError::from_legacy_error)?;
        let key_length = self.algorithm().key_length();

        let matched = match revision {
            LegacyRevision::R2 => {
                let mut expected = PASSWORD_PADDING;
                apply_rc4(file_key.as_bytes(), key_length, &mut expected)?;
                ct_eq(&expected, user_entry)
            }
            LegacyRevision::R3OrR4 => {
                let mut md5 = Md5::new();
                md5.update(&PASSWORD_PADDING);
                md5.update(file_id.permanent());
                let mut expected = md5.finalize();
                for round in 0..RC4_ROUND_COUNT {
                    apply_rc4_round(file_key.as_bytes(), key_length, round, &mut expected)?;
                }
                let Some(user_prefix) = user_entry.first_chunk::<LEGACY_R3_USER_COMPARE_LEN>()
                else {
                    return Err(AuthError::InvalidEntryLength {
                        key: EncryptKey::U,
                        actual: user_entry.len(),
                    });
                };
                ct_eq(&expected, user_prefix)
            }
        };

        if matched {
            Ok(file_key)
        } else {
            Err(AuthError::IncorrectPassword)
        }
    }

    fn authenticate_legacy_owner(
        &self,
        revision: LegacyRevision,
        password: &[u8],
        owner_entry: &[u8; PADDED_PASSWORD_LEN],
        user_entry: &[u8; PADDED_PASSWORD_LEN],
        file_id: &FileId,
    ) -> Result<LegacyFileKey, AuthError> {
        let mut digest = Md5::digest(&padded_password(password));
        if matches!(revision, LegacyRevision::R3OrR4) {
            // Algorithm 3 手順 3 は Algorithm 2 と異なり 16 バイト全体を再ハッシュする。
            for _ in 0..REHASH_COUNT {
                digest = Md5::digest(&digest);
            }
        }

        let key_length = self.algorithm().key_length();
        let key_len = usize::from(key_length.bytes());
        let Some(owner_rc4_key) = digest.get(..key_len) else {
            return Err(AuthError::InvalidKeyLength { length: key_length });
        };

        let mut recovered_user = *owner_entry;
        match revision {
            LegacyRevision::R2 => {
                apply_rc4(owner_rc4_key, key_length, &mut recovered_user)?;
            }
            LegacyRevision::R3OrR4 => {
                for round in (0..RC4_ROUND_COUNT).rev() {
                    apply_rc4_round(owner_rc4_key, key_length, round, &mut recovered_user)?;
                }
            }
        }

        self.authenticate_legacy_padded_user(revision, &recovered_user, user_entry, file_id)
    }

    fn authenticate_aes256(
        &self,
        role: PasswordRole,
        password: &[u8],
    ) -> Result<AuthenticatedFileKey, AuthError> {
        // 不正な UTF-8 入力でも辞書項目の長さ不正（構造破損）を隠さないよう先に検証する。
        self.validate_aes256_entries(role)
            .map_err(AuthError::from_aes256_error)?;

        // R5・R6 のパスワードは UTF-8 文字列。UTF-8 として解釈できないバイト列は
        // いずれの検証ハッシュとも一致しないため、認証失敗として扱う。
        let Ok(prepared) = std::str::from_utf8(password) else {
            return Err(AuthError::IncorrectPassword);
        };

        let key = self
            .derive_aes256_file_key(role, prepared)
            .map_err(AuthError::from_aes256_error)?;

        Ok(AuthenticatedFileKey {
            key: FileEncryptionKey::Aes256(key),
            role,
        })
    }
}

fn fixed_legacy_entry(
    key: EncryptKey,
    bytes: &[u8],
) -> Result<&[u8; PADDED_PASSWORD_LEN], AuthError> {
    bytes.try_into().map_err(|_| AuthError::InvalidEntryLength {
        key,
        actual: bytes.len(),
    })
}

fn apply_rc4(key: &[u8], key_length: KeyLength, data: &mut [u8]) -> Result<(), AuthError> {
    let mut rc4 = Rc4::new(key).ok_or(AuthError::InvalidKeyLength { length: key_length })?;
    rc4.apply(data);
    Ok(())
}

fn apply_rc4_round(
    base_key: &[u8],
    key_length: KeyLength,
    round: u8,
    data: &mut [u8],
) -> Result<(), AuthError> {
    let mut round_key = [0_u8; DIGEST_LEN];
    let Some(slice) = round_key.get_mut(..base_key.len()) else {
        return Err(AuthError::InvalidKeyLength { length: key_length });
    };
    for (slot, &byte) in slice.iter_mut().zip(base_key) {
        *slot = byte ^ round;
    }
    apply_rc4(slice, key_length, data)
}

fn ct_eq<const N: usize>(left: &[u8; N], right: &[u8; N]) -> bool {
    left.iter()
        .zip(right)
        .fold(0_u8, |diff, (&a, &b)| diff | (a ^ b))
        == 0
}

#[cfg(test)]
mod tests;
