//! 標準セキュリティハンドラのアルゴリズム版（`/V`）とリビジョン（`/R`）の組み合わせ
//! （ISO 32000-1:2008 §7.6.2 表 20 / ISO 32000-2:2020 §7.6.2、
//! `docs/specs/02b_encryption.md` §3）。

use crate::byte_offset::ByteOffset;
use crate::encrypt::crypt_filter::CryptFilters;
use crate::encrypt::error::EncryptError;
use crate::encrypt::key::EncryptKey;
use crate::encrypt::{take_optional_integer, take_required_bytes};
use crate::object::dictionary::PdfDictionary;

/// `/V` と `/R` の対応済みの組み合わせ。辞書に触れずに判定するための中間表現。
///
/// 辞書からキーをムーブし始める前にこの判定を済ませることで、対応外と分かった時点で
/// 生辞書を無傷のまま [`EncryptDictionary::Unsupported`] に載せられる。
///
/// [`EncryptDictionary::Unsupported`]: crate::encrypt::EncryptDictionary::Unsupported
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AlgorithmKind {
    /// `/V 1` `/R 2` — RC4 40 ビット固定。
    V1R2,
    /// `/V 1` `/R 3` — RC4 40 ビット固定。リビジョン 3 固有の権限ビットを使う場合。
    V1R3,
    /// `/V 2` `/R 3` — RC4 可変長（40..=128 ビット）。
    V2R3,
    /// `/V 4` `/R 4` — crypt filter による方式選択。
    V4R4,
    /// `/V 5` `/R 5` — AES-256（Adobe ExtensionLevel 3。ISO 32000-2 で非推奨）。
    V5R5,
    /// `/V 5` `/R 6` — AES-256（ISO 32000-2 §7.6.4.3）。
    V5R6,
}

impl AlgorithmKind {
    /// `/V` と `/R` の値から組み合わせを判定する。
    ///
    /// 対応外の組み合わせは `None` を返す。`/V 0`（未文書化アルゴリズム）と
    /// `/V 3`（非公開アルゴリズム）は ISO 32000-1 表 20 が内容を規定しないため、
    /// `/R` の値によらずここに含まれる。
    ///
    /// `None` は「壊れている」ではなく「解釈しない」を意味するため、呼び出し側は
    /// エラーではなく [`EncryptDictionary::Unsupported`] に倒すこと（#604）。
    ///
    /// [`EncryptDictionary::Unsupported`]: crate::encrypt::EncryptDictionary::Unsupported
    #[must_use]
    pub fn from_version_revision(version: i64, revision: i64) -> Option<Self> {
        match (version, revision) {
            (1, 2) => Some(Self::V1R2),
            (1, 3) => Some(Self::V1R3),
            (2, 3) => Some(Self::V2R3),
            (4, 4) => Some(Self::V4R4),
            (5, 5) => Some(Self::V5R5),
            (5, 6) => Some(Self::V5R6),
            _ => None,
        }
    }
}

/// ファイル暗号鍵の長さ（ビット）。
///
/// `/Length` から作れるのは 40..=128 かつ 8 の倍数の値だけ（[`Self::from_bits`]）。
/// `/V 5` の 256 ビットは `/Length` ではなく `/V` から確定するため、
/// 定数 [`Self::BITS_256`] でのみ構築する。
///
/// # 既存方針からの逸脱について
///
/// 本クレートの newtype（`ByteOffset` / `ObjectNumber` / `PdfName` など）は
/// 「生成は無検証、妥当性検証は上位の責務」を方針としている。`KeyLength` は
/// これに反して検証付きコンストラクタだけを持つ。鍵長が復号アルゴリズムの選択に
/// 直結し、範囲外の値を保持したまま下流に流すと復号側で再検証が必要になるため
/// （#604）。したがって無検証の `new` は用意しない。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct KeyLength(u16);

/// `/Length` の下限（ビット）。
const MIN_KEY_LENGTH_BITS: u16 = 40;
/// `/Length` の上限（ビット）。
const MAX_KEY_LENGTH_BITS: u16 = 128;
/// 鍵長はバイト単位で表せる必要があるため、8 の倍数に限る。
const KEY_LENGTH_STEP_BITS: u16 = 8;

impl KeyLength {
    /// RC4 40 ビット。`/Length` が無いときの既定値であり、`/V 1` の固定値。
    pub const BITS_40: Self = Self(MIN_KEY_LENGTH_BITS);
    /// AES-256。`/V 5` の固定値（`/Length` からは構築できない）。
    pub const BITS_256: Self = Self(256);

    /// `/Length` のビット数から鍵長を作る。
    ///
    /// 40..=128 かつ 8 の倍数でなければ `None`（ISO 32000-1 §7.6.2 表 20）。
    #[must_use]
    pub fn from_bits(bits: u16) -> Option<Self> {
        if !(MIN_KEY_LENGTH_BITS..=MAX_KEY_LENGTH_BITS).contains(&bits)
            || !bits.is_multiple_of(KEY_LENGTH_STEP_BITS)
        {
            return None;
        }
        Some(Self(bits))
    }

    /// 鍵長をビット数で返す。
    #[must_use]
    pub fn bits(self) -> u16 {
        self.0
    }

    /// 鍵長をバイト数で返す。
    #[must_use]
    pub fn bytes(self) -> u16 {
        self.0 / KEY_LENGTH_STEP_BITS
    }
}

/// 標準セキュリティハンドラのアルゴリズム。
///
/// 取りうる `/V` × `/R` の組み合わせだけをバリアントとして持つため、
/// 「`/V 1` なのに `/R 6`」のような不正な状態を構築できない（#604）。
/// `/OE` `/UE` `/Perms` は `/R 5` `/R 6` にしか存在しないキーなので、
/// 該当バリアントの中にだけ置いている。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub enum StandardAlgorithm {
    /// `/V 1` `/R 2`。鍵長は 40 ビット固定。
    V1R2,
    /// `/V 1` `/R 3`。鍵長は 40 ビット固定。
    V1R3,
    /// `/V 2` `/R 3`。`/Length` で鍵長を指定する。
    V2R3 {
        /// `/Length`（既定 40 ビット）。
        key_length: KeyLength,
    },
    /// `/V 4` `/R 4`。crypt filter で方式を選択する。
    V4R4 {
        /// 暗号化辞書直下の `/Length`（ファイル暗号鍵の長さ、既定 40 ビット）。
        key_length: KeyLength,
        /// `/CF` `/StmF` `/StrF` `/EFF`。
        crypt_filters: CryptFilters,
    },
    /// `/V 5` `/R 5`（Adobe ExtensionLevel 3、ISO 32000-2 で非推奨）。AES-256。
    V5R5 {
        /// `/CF` `/StmF` `/StrF` `/EFF`。
        crypt_filters: CryptFilters,
        /// `/OE` `/UE` `/Perms`。
        keys: AesKeyMaterial,
    },
    /// `/V 5` `/R 6`。AES-256。
    V5R6 {
        /// `/CF` `/StmF` `/StrF` `/EFF`。
        crypt_filters: CryptFilters,
        /// `/OE` `/UE` `/Perms`。
        keys: AesKeyMaterial,
    },
}

/// `/R 5` `/R 6` でのみ現れる鍵・権限のバイト列。
///
/// 復号は行わないため中身は解釈せず、長さの検証もしない（#604 の設計判断）。
/// 仕様上は 48 バイト・16 バイト固定だが、わずかに逸脱した実在 PDF で
/// 解析を止めないことを優先する。長さの検証は鍵導出を行う実装の責務。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct AesKeyMaterial {
    /// `/OE` — 所有者用の暗号化ファイル鍵。
    pub owner_encrypted_key: Vec<u8>,
    /// `/UE` — 利用者用の暗号化ファイル鍵。
    pub user_encrypted_key: Vec<u8>,
    /// `/Perms` — 権限の暗号化コピー。
    pub perms: Vec<u8>,
}

impl StandardAlgorithm {
    /// 判定済みの組み合わせに応じて、辞書から必要なキーを取り出す。
    ///
    /// `dictionary` からは取り出したキーが除去される。
    ///
    /// # Errors
    ///
    /// `/Length` が範囲外、`/CF` が無い・構造不正、`/OE` `/UE` `/Perms` が
    /// 無い・型が違う場合。
    pub(crate) fn take(
        kind: AlgorithmKind,
        dictionary: &mut PdfDictionary,
        position: ByteOffset,
    ) -> Result<Self, EncryptError> {
        match kind {
            AlgorithmKind::V1R2 => Ok(Self::V1R2),
            AlgorithmKind::V1R3 => Ok(Self::V1R3),
            AlgorithmKind::V2R3 => Ok(Self::V2R3 {
                key_length: take_key_length(dictionary, position)?,
            }),
            AlgorithmKind::V4R4 => {
                let key_length = take_key_length(dictionary, position)?;
                let crypt_filters = CryptFilters::take(dictionary, position)?;
                Ok(Self::V4R4 {
                    key_length,
                    crypt_filters,
                })
            }
            AlgorithmKind::V5R5 => {
                let crypt_filters = CryptFilters::take(dictionary, position)?;
                let keys = take_aes_key_material(dictionary, position)?;
                Ok(Self::V5R5 {
                    crypt_filters,
                    keys,
                })
            }
            AlgorithmKind::V5R6 => {
                let crypt_filters = CryptFilters::take(dictionary, position)?;
                let keys = take_aes_key_material(dictionary, position)?;
                Ok(Self::V5R6 {
                    crypt_filters,
                    keys,
                })
            }
        }
    }

    /// ファイル暗号鍵の長さを返す。
    ///
    /// `/V 1` は 40 ビット固定、`/V 5` は 256 ビット固定で、いずれも `/Length` に
    /// 依存しない（ISO 32000-1 表 20 / ISO 32000-2 §7.6.4.2）。
    /// `/V 2` `/V 4` は暗号化辞書直下の `/Length`（既定 40）を返す。
    pub fn key_length(&self) -> KeyLength {
        match self {
            Self::V1R2 | Self::V1R3 => KeyLength::BITS_40,
            Self::V2R3 { key_length } | Self::V4R4 { key_length, .. } => *key_length,
            Self::V5R5 { .. } | Self::V5R6 { .. } => KeyLength::BITS_256,
        }
    }
}

/// `/Length` を取り出す。無ければ既定値 40 ビット（ISO 32000-1 §7.6.2 表 20）。
fn take_key_length(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<KeyLength, EncryptError> {
    let Some(value) = take_optional_integer(dictionary, EncryptKey::Length, position)? else {
        return Ok(KeyLength::BITS_40);
    };

    u16::try_from(value)
        .ok()
        .and_then(KeyLength::from_bits)
        .ok_or_else(|| EncryptError::invalid_key_length_at(position, value))
}

/// `/OE` `/UE` `/Perms` を取り出す（`/R 5` `/R 6` では必須）。
fn take_aes_key_material(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<AesKeyMaterial, EncryptError> {
    let owner_encrypted_key = take_required_bytes(dictionary, EncryptKey::OE, position)?;
    let user_encrypted_key = take_required_bytes(dictionary, EncryptKey::UE, position)?;
    let perms = take_required_bytes(dictionary, EncryptKey::Perms, position)?;
    Ok(AesKeyMaterial {
        owner_encrypted_key,
        user_encrypted_key,
        perms,
    })
}

#[cfg(test)]
mod tests {
    use super::{AlgorithmKind, KeyLength};

    // ISO 32000-1 表 20 が定める 6 種の組み合わせが対応するバリアントになることを確認する
    #[test]
    fn from_version_revision_maps_supported_combinations() {
        let cases: [(i64, i64, AlgorithmKind); 6] = [
            (1, 2, AlgorithmKind::V1R2),
            (1, 3, AlgorithmKind::V1R3),
            (2, 3, AlgorithmKind::V2R3),
            (4, 4, AlgorithmKind::V4R4),
            (5, 5, AlgorithmKind::V5R5),
            (5, 6, AlgorithmKind::V5R6),
        ];
        for (version, revision, expected) in cases {
            assert_eq!(
                AlgorithmKind::from_version_revision(version, revision),
                Some(expected),
                "/V {version} /R {revision}"
            );
        }
    }

    // 未文書化・非公開・表にない組み合わせが None になることを確認する
    #[test]
    fn from_version_revision_rejects_unsupported_combinations() {
        let cases: [(i64, i64); 9] = [
            (0, 2),
            (0, 0),
            (3, 3),
            (1, 6),
            (2, 2),
            (4, 3),
            (5, 4),
            (6, 6),
            (-1, 2),
        ];
        for (version, revision) in cases {
            assert_eq!(
                AlgorithmKind::from_version_revision(version, revision),
                None,
                "/V {version} /R {revision}"
            );
        }
    }

    // 40..=128 かつ 8 の倍数のビット数が受理されることを確認する
    #[test]
    fn from_bits_accepts_specified_key_lengths() {
        let cases: [u16; 3] = [40, 48, 128];
        for bits in cases {
            let key_length = KeyLength::from_bits(bits).expect("bits should be accepted");
            assert_eq!(key_length.bits(), bits);
            assert_eq!(key_length.bytes(), bits / 8, "bits: {bits}");
        }
    }

    // 下限未満・上限超過・8 の倍数でないビット数が拒否されることを確認する
    #[test]
    fn from_bits_rejects_out_of_range_key_lengths() {
        let cases: [u16; 4] = [0, 32, 44, 132];
        for bits in cases {
            assert_eq!(KeyLength::from_bits(bits), None, "bits: {bits}");
        }
    }

    // 定数が仕様どおりのビット数・バイト数を表すことを確認する
    #[test]
    fn key_length_constants_hold_specified_bits() {
        assert_eq!(KeyLength::BITS_40.bits(), 40);
        assert_eq!(KeyLength::BITS_40.bytes(), 5);
        assert_eq!(KeyLength::BITS_256.bits(), 256);
        assert_eq!(KeyLength::BITS_256.bytes(), 32);
    }
}
