//! 標準セキュリティハンドラ（`/Filter /Standard`）
//! （ISO 32000-1:2008 §7.6.3 表 21、`docs/specs/02b_encryption.md` §2）。

use crate::byte_offset::ByteOffset;
use crate::encrypt::algorithm::{AlgorithmKind, StandardAlgorithm};
use crate::encrypt::error::EncryptError;
use crate::encrypt::key::EncryptKey;
use crate::encrypt::permissions::Permissions;
use crate::encrypt::{take_optional_bool, take_optional_integer, take_required_bytes};
use crate::object::dictionary::PdfDictionary;

/// `/EncryptMetadata` の既定値（ISO 32000-1 表 21）。
const DEFAULT_ENCRYPT_METADATA: bool = true;

/// 標準セキュリティハンドラの暗号化辞書。
///
/// `/V` × `/R` の組み合わせに依存する値は [`StandardAlgorithm`] が、
/// 組み合わせに依らず常に存在する値（`/O` `/U` `/P` `/EncryptMetadata`）は
/// 本型が保持する。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct StandardSecurityHandler {
    algorithm: StandardAlgorithm,
    owner_key: Vec<u8>,
    user_key: Vec<u8>,
    permissions: Permissions,
    encrypt_metadata: bool,
}

impl StandardSecurityHandler {
    /// 判定済みの `/V` × `/R` 組み合わせをもとに、辞書から各キーを取り出す。
    ///
    /// `dictionary` は所有で受け取り、値をムーブで取り出す（clone 回避）。
    /// 未知のキーは無視する（`Trailer::from_dictionary` と同じ方針）。
    ///
    /// # Errors
    ///
    /// 必須キー（`/O` `/U` `/P`）の欠落・型不一致、`/Length` の範囲外、
    /// crypt filter の構造不正、`/P` が 32 ビットに収まらない場合。
    pub(crate) fn from_dictionary(
        kind: AlgorithmKind,
        mut dictionary: PdfDictionary,
        position: ByteOffset,
    ) -> Result<Self, EncryptError> {
        let algorithm = StandardAlgorithm::take(kind, &mut dictionary, position)?;
        let owner_key = take_required_bytes(&mut dictionary, EncryptKey::O, position)?;
        let user_key = take_required_bytes(&mut dictionary, EncryptKey::U, position)?;
        let permissions = take_permissions(&mut dictionary, position)?;
        let encrypt_metadata =
            take_optional_bool(&mut dictionary, EncryptKey::EncryptMetadata, position)?
                .unwrap_or(DEFAULT_ENCRYPT_METADATA);

        Ok(Self {
            algorithm,
            owner_key,
            user_key,
            permissions,
            encrypt_metadata,
        })
    }

    /// `/V` × `/R` の組み合わせと、それに紐づく値を返す。
    pub fn algorithm(&self) -> &StandardAlgorithm {
        &self.algorithm
    }

    /// `/O` — 所有者パスワードから導出した値。長さは検証していない。
    #[must_use]
    pub fn owner_key(&self) -> &[u8] {
        &self.owner_key
    }

    /// `/U` — 利用者パスワードから導出した値。長さは検証していない。
    #[must_use]
    pub fn user_key(&self) -> &[u8] {
        &self.user_key
    }

    /// `/P` — アクセス権限フラグ。
    pub fn permissions(&self) -> Permissions {
        self.permissions
    }

    /// `/EncryptMetadata` — メタデータを暗号化するか（既定 true）。
    #[must_use]
    pub fn encrypt_metadata(&self) -> bool {
        self.encrypt_metadata
    }
}

/// `/P` を取り出す。必須キー。
fn take_permissions(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<Permissions, EncryptError> {
    let Some(bits) = take_optional_integer(dictionary, EncryptKey::P, position)? else {
        return Err(EncryptError::missing_required_key_at(
            position,
            EncryptKey::P,
        ));
    };
    Permissions::from_integer(bits, position)
}
