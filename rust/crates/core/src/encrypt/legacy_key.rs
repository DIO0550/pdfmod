//! PDF の R2〜R4 のファイル暗号鍵導出（ISO 32000-1:2008 §7.6.3.3 Algorithm 2）。

use std::fmt;

use crate::encrypt::algorithm::{KeyLength, StandardAlgorithm};
use crate::encrypt::md5::{Md5, DIGEST_LEN};
use crate::encrypt::standard::StandardSecurityHandler;
use crate::xref::trailer::file_id::FileId;

pub(super) const PADDED_PASSWORD_LEN: usize = 32;
pub(super) const PASSWORD_PADDING: [u8; PADDED_PASSWORD_LEN] = [
    0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
    0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
];
const CLEAR_METADATA_BYTES: [u8; 4] = [0xff; 4];
pub(super) const REHASH_COUNT: usize = 50;

/// Algorithm 2 で導出した 5〜16 バイトのファイル暗号鍵。
/// 鍵は `digest` の先頭 `length.bytes()` バイトに収まる。
#[must_use]
pub struct LegacyFileKey {
    digest: [u8; DIGEST_LEN],
    length: KeyLength,
}

impl LegacyFileKey {
    /// ファイル暗号鍵をバイト列で返す。
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.digest[..usize::from(self.length.bytes())]
    }
}

impl fmt::Debug for LegacyFileKey {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter
            .debug_struct("LegacyFileKey")
            .field("length", &self.length)
            .finish_non_exhaustive()
    }
}

/// Algorithm 2 を適用できない理由。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum LegacyFileKeyError {
    /// `/R 5` または `/R 6` は別の鍵導出手順を使う。
    UnsupportedRevision,
    /// トレイラの `/ID` が欠けている。
    MissingFileId,
    /// `/O` が仕様で定められた 32 バイトと異なる。
    InvalidOwnerEntryLength {
        /// 実際の `/O` のバイト数。
        actual: usize,
    },
    /// 鍵長が MD5 ダイジェストの長さを超えている。
    InvalidKeyLength {
        /// アルゴリズムが指定する鍵長。
        length: KeyLength,
    },
}

impl StandardSecurityHandler {
    /// パスワードのバイト列とトレイラの `/ID` から、R2〜R4 のファイル暗号鍵を導出する。
    /// 導出した鍵が正しいかは、別途 `/U` を使って確認する。
    ///
    /// # Errors
    ///
    /// R5・R6、`/ID` の欠落、`/O` の長さの不一致、鍵長が 16 バイトを超える場合。
    pub fn derive_legacy_file_key(
        &self,
        password: &[u8],
        file_id: Option<&FileId>,
    ) -> Result<LegacyFileKey, LegacyFileKeyError> {
        self.derive_legacy_file_key_from_padded(&padded_password(password), file_id)
    }

    /// 32 バイトに整え済みのパスワードから R2〜R4 のファイル暗号鍵を導出する。
    ///
    /// Algorithm 7 で `/O` から復元した 32 バイトのパディング済み利用者パスワードを
    /// 二重パディングせずそのまま Algorithm 2 に渡すために使用する。
    pub(super) fn derive_legacy_file_key_from_padded(
        &self,
        padded: &[u8; PADDED_PASSWORD_LEN],
        file_id: Option<&FileId>,
    ) -> Result<LegacyFileKey, LegacyFileKeyError> {
        let algorithm = self.algorithm();
        let rehash_count = match algorithm {
            StandardAlgorithm::V1R2 => 0,
            StandardAlgorithm::V1R3
            | StandardAlgorithm::V2R3 { .. }
            | StandardAlgorithm::V4R4 { .. } => REHASH_COUNT,
            StandardAlgorithm::V5R5 { .. } | StandardAlgorithm::V5R6 { .. } => {
                return Err(LegacyFileKeyError::UnsupportedRevision);
            }
        };

        let file_id = file_id.ok_or(LegacyFileKeyError::MissingFileId)?;
        let owner_entry = self.owner_key();
        // Algorithm 3 の /O は 32 バイトに整えたパスワードの暗号化結果。
        let owner_entry = <&[u8; PADDED_PASSWORD_LEN]>::try_from(owner_entry).map_err(|_| {
            LegacyFileKeyError::InvalidOwnerEntryLength {
                actual: owner_entry.len(),
            }
        })?;

        let length = algorithm.key_length();
        if usize::from(length.bytes()) > DIGEST_LEN {
            return Err(LegacyFileKeyError::InvalidKeyLength { length });
        }

        let mut md5 = Md5::new();
        md5.update(padded);
        md5.update(owner_entry);
        md5.update(&self.permissions().bits().to_le_bytes());
        md5.update(file_id.permanent());

        if matches!(algorithm, StandardAlgorithm::V4R4 { .. }) && !self.encrypt_metadata() {
            md5.update(&CLEAR_METADATA_BYTES);
        }

        let mut key = LegacyFileKey {
            digest: md5.finalize(),
            length,
        };
        for _ in 0..rehash_count {
            key.digest = Md5::digest(key.as_bytes());
        }
        Ok(key)
    }
}

pub(super) fn padded_password(password: &[u8]) -> [u8; PADDED_PASSWORD_LEN] {
    let mut padded = [0; PADDED_PASSWORD_LEN];
    let input = password.iter().chain(&PASSWORD_PADDING);
    for (slot, &byte) in padded.iter_mut().zip(input) {
        *slot = byte;
    }
    padded
}

#[cfg(test)]
mod tests;
