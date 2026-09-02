//! crypt filter（`/CF` `/StmF` `/StrF` `/EFF`）の型表現
//! （ISO 32000-1:2008 §7.6.5 表 25/26、`docs/specs/02b_encryption.md` §4）。

use std::collections::BTreeMap;

use crate::byte_offset::ByteOffset;
use crate::encrypt::algorithm::KeyLength;
use crate::encrypt::error::EncryptError;
use crate::encrypt::key::{CryptFilterKey, EncryptKey, EncryptKeyPath};
use crate::object::dictionary::PdfDictionary;
use crate::object::name::PdfName;
use crate::object::pdf_object::PdfObject;

/// `/Identity` — 暗号化も復号もしない組み込みの crypt filter 名。
///
/// `/CF` には定義されないため、`/StmF /Identity` を「未定義の filter を指している」
/// として弾いてはならない。
const IDENTITY: &[u8] = b"Identity";

/// `/CF` の `/Length` をバイト表記とみなす下限（40 ビット = 5 バイト）。
const MIN_LENGTH_BYTES: u16 = 5;
/// `/CF` の `/Length` をバイト表記とみなす上限（128 ビット = 16 バイト）。
const MAX_LENGTH_BYTES: u16 = 16;
/// バイト表記をビット表記へ正規化する係数。
const BITS_PER_BYTE: u16 = 8;

/// crypt filter の集合と、ストリーム・文字列・埋め込みファイルへの割り当て。
///
/// 構造は `XRefTable`（`xref/table.rs`）に倣い、tuple struct ではなく
/// 名前付きフィールド + アクセサとする。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct CryptFilters {
    /// `BTreeMap` は `PdfDictionary` の内部表現に揃えている。反復順がキー昇順で
    /// 決定的になり、テストと出力が安定する（`HashMap` では順序が保証されない）。
    filters: BTreeMap<PdfName, CryptFilter>,
    stream: CryptFilterSelector,
    string: CryptFilterSelector,
    embedded_file: Option<CryptFilterSelector>,
}

/// crypt filter の指定。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub enum CryptFilterSelector {
    /// `/Identity` — 暗号化しない。`/CF` には定義されない組み込みの名前。
    Identity,
    /// `/CF` に定義された名前。
    Named(PdfName),
}

/// `/CF` の各エントリ。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct CryptFilter {
    method: CryptFilterMethod,
    auth_event: AuthEvent,
    length: Option<KeyLength>,
}

/// `/CFM` — crypt filter の暗号方式。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptFilterMethod {
    /// `/None` — 暗号化しない。
    None,
    /// `/V2` — RC4。
    V2,
    /// `/AESV2` — AES-128（CBC、PKCS#5 パディング）。
    AesV2,
    /// `/AESV3` — AES-256（CBC、PKCS#5 パディング）。
    AesV3,
}

impl CryptFilterMethod {
    /// `/CFM` の値から方式を判定する。既知の集合に無ければ `None`。
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Option<Self> {
        match bytes {
            b"None" => Some(Self::None),
            b"V2" => Some(Self::V2),
            b"AESV2" => Some(Self::AesV2),
            b"AESV3" => Some(Self::AesV3),
            _ => None,
        }
    }

    /// `/CFM` の値としての表記を返す。
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::None => "None",
            Self::V2 => "V2",
            Self::AesV2 => "AESV2",
            Self::AesV3 => "AESV3",
        }
    }
}

/// `/AuthEvent` — crypt filter の認証イベント。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AuthEvent {
    /// `/DocOpen` — 文書を開くときに認証する。
    DocOpen,
    /// `/EFOpen` — 埋め込みファイルを開くときに認証する。
    EFOpen,
}

impl AuthEvent {
    /// `/AuthEvent` の値から認証イベントを判定する。
    ///
    /// ISO 32000-1 表 25 は既定値を `/DocOpen` と定めており、未知の値も既定に倒す。
    /// 認証イベントは暗号方式の選択に影響しないため、ここで解析を止めない。
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Self {
        match bytes {
            b"EFOpen" => Self::EFOpen,
            _ => Self::DocOpen,
        }
    }
}

impl CryptFilters {
    /// `/CF` `/StmF` `/StrF` `/EFF` を辞書から取り出す（取り出したキーは除去される）。
    ///
    /// # Errors
    ///
    /// - [`EncryptErrorKind::MissingCryptFilters`] — `/CF` が無い
    /// - [`EncryptErrorKind::InvalidKeyType`] — `/CF` やそのエントリが辞書でない、
    ///   `/StmF` `/StrF` `/EFF` が名前でない
    /// - [`EncryptErrorKind::UnknownCryptFilterMethod`] — `/CFM` が既知の値でない
    /// - [`EncryptErrorKind::UndefinedCryptFilter`] — `/StmF` `/StrF` `/EFF` が
    ///   `/Identity` でも `/CF` のキーでもない名前を指している
    ///
    /// [`EncryptErrorKind::MissingCryptFilters`]: crate::encrypt::error::EncryptErrorKind::MissingCryptFilters
    /// [`EncryptErrorKind::InvalidKeyType`]: crate::encrypt::error::EncryptErrorKind::InvalidKeyType
    /// [`EncryptErrorKind::UnknownCryptFilterMethod`]: crate::encrypt::error::EncryptErrorKind::UnknownCryptFilterMethod
    /// [`EncryptErrorKind::UndefinedCryptFilter`]: crate::encrypt::error::EncryptErrorKind::UndefinedCryptFilter
    pub(crate) fn take(
        dictionary: &mut PdfDictionary,
        position: ByteOffset,
    ) -> Result<Self, EncryptError> {
        let filters = take_filter_map(dictionary, position)?;

        let stream = take_selector(dictionary, EncryptKey::StmF, position)?
            .unwrap_or(CryptFilterSelector::Identity);
        let string = take_selector(dictionary, EncryptKey::StrF, position)?
            .unwrap_or(CryptFilterSelector::Identity);
        let embedded_file = take_selector(dictionary, EncryptKey::EFF, position)?;

        let filters = Self {
            filters,
            stream,
            string,
            embedded_file,
        };
        filters.ensure_selectors_defined(position)?;
        Ok(filters)
    }

    /// `/StmF` `/StrF` `/EFF` が `/CF` に定義された名前を指しているか検証する。
    fn ensure_selectors_defined(&self, position: ByteOffset) -> Result<(), EncryptError> {
        let targets: [(EncryptKey, Option<&CryptFilterSelector>); 3] = [
            (EncryptKey::StmF, Some(&self.stream)),
            (EncryptKey::StrF, Some(&self.string)),
            (EncryptKey::EFF, self.embedded_file.as_ref()),
        ];
        for (key, selector) in targets {
            let Some(CryptFilterSelector::Named(name)) = selector else {
                continue;
            };
            if !self.filters.contains_key(name) {
                return Err(EncryptError::undefined_crypt_filter_at(
                    position,
                    key,
                    name.clone(),
                ));
            }
        }
        Ok(())
    }

    /// 指定から crypt filter を引く。`/Identity` は `None` を返す。
    #[must_use]
    pub fn get(&self, selector: &CryptFilterSelector) -> Option<&CryptFilter> {
        match selector {
            CryptFilterSelector::Identity => None,
            CryptFilterSelector::Named(name) => self.filters.get(name),
        }
    }

    /// ストリームに適用する crypt filter の指定（`/StmF`、既定 `/Identity`）を返す。
    pub fn stream(&self) -> &CryptFilterSelector {
        &self.stream
    }

    /// 文字列に適用する crypt filter の指定（`/StrF`、既定 `/Identity`）を返す。
    pub fn string(&self) -> &CryptFilterSelector {
        &self.string
    }

    /// 埋め込みファイルに適用する crypt filter の指定（`/EFF`）を返す。
    #[must_use]
    pub fn embedded_file(&self) -> Option<&CryptFilterSelector> {
        self.embedded_file.as_ref()
    }

    /// `/CF` に定義されている crypt filter の個数を返す。
    #[must_use]
    pub fn len(&self) -> usize {
        self.filters.len()
    }

    /// `/CF` に crypt filter が 1 つも定義されていないかを返す。
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.filters.is_empty()
    }
}

/// `/CF` を取り出して各エントリを型に変換する。
///
/// エントリの辞書は `remove` でムーブして [`CryptFilter::from_dictionary`] に渡す
/// （`iter()` で参照を回すと値の clone が必要になるため）。
/// キーは `BTreeMap` のキーとして所有権が要るので clone する。
fn take_filter_map(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<BTreeMap<PdfName, CryptFilter>, EncryptError> {
    let Some(value) = dictionary.remove(EncryptKey::CF.as_bytes()) else {
        return Err(EncryptError::missing_crypt_filters_at(position));
    };
    let actual = value.kind();
    let PdfObject::Dictionary(mut entries) = value else {
        return Err(EncryptError::invalid_key_type_at(
            position,
            EncryptKeyPath::Root(EncryptKey::CF),
            actual,
        ));
    };

    let names: Vec<PdfName> = entries.keys().cloned().collect();
    let mut filters = BTreeMap::new();
    for name in names {
        let Some(entry) = entries.remove(name.as_bytes()) else {
            continue;
        };
        let actual = entry.kind();
        let PdfObject::Dictionary(entry) = entry else {
            // name はループが所有しており、この分岐で return するため clone は不要。
            return Err(EncryptError::invalid_key_type_at(
                position,
                EncryptKeyPath::CryptFilterEntry { name },
                actual,
            ));
        };
        // &name の借用を先に終わらせてから、name を BTreeMap のキーとして move する。
        let filter = CryptFilter::from_dictionary(entry, &name, position)?;
        filters.insert(name, filter);
    }
    Ok(filters)
}

/// `/StmF` `/StrF` `/EFF` の指定を取り出す。
fn take_selector(
    dictionary: &mut PdfDictionary,
    key: EncryptKey,
    position: ByteOffset,
) -> Result<Option<CryptFilterSelector>, EncryptError> {
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Ok(None);
    };
    let actual = value.kind();
    let PdfObject::Name(name) = value else {
        return Err(EncryptError::invalid_key_type_at(
            position,
            EncryptKeyPath::Root(key),
            actual,
        ));
    };
    if name.as_bytes() == IDENTITY {
        return Ok(Some(CryptFilterSelector::Identity));
    }
    Ok(Some(CryptFilterSelector::Named(name)))
}

impl CryptFilter {
    /// `/CF` のエントリ辞書を型に変換する。
    ///
    /// `name` は自身の crypt filter 名。エラーにどのエントリかを載せるためだけに受け取る。
    fn from_dictionary(
        mut dictionary: PdfDictionary,
        name: &PdfName,
        position: ByteOffset,
    ) -> Result<Self, EncryptError> {
        let method = take_method(&mut dictionary, name, position)?;

        // /AuthEvent /Length は型不一致でもエラーにせず既定値へフォールバックする（#607 で維持）。
        let auth_event = dictionary
            .get(CryptFilterKey::AuthEvent.as_bytes())
            .and_then(PdfObject::as_name)
            .map_or(AuthEvent::DocOpen, |name| {
                AuthEvent::from_bytes(name.as_bytes())
            });

        let length = dictionary
            .get(CryptFilterKey::Length.as_bytes())
            .and_then(PdfObject::as_integer)
            .and_then(parse_length);

        Ok(Self {
            method,
            auth_event,
            length,
        })
    }

    /// 暗号方式（`/CFM`）を返す。
    #[must_use]
    pub fn method(&self) -> CryptFilterMethod {
        self.method
    }

    /// 認証イベント（`/AuthEvent`）を返す。
    #[must_use]
    pub fn auth_event(&self) -> AuthEvent {
        self.auth_event
    }

    /// `/CF` エントリの `/Length` を検証済みの鍵長として返す。
    ///
    /// `/Length` が無い場合と、解釈できない値だった場合は `None`。
    /// 単位の解釈は `parse_length` が境界で済ませているため、
    /// 返る [`KeyLength`] は 40..=128 ビットかつ 8 の倍数であることが型で保証される。
    /// ファイル暗号鍵の長さは暗号化辞書直下の `/Length`
    /// （[`StandardAlgorithm::key_length`](crate::encrypt::algorithm::StandardAlgorithm::key_length)）から読む。
    #[must_use]
    pub fn length(&self) -> Option<KeyLength> {
        self.length
    }
}

/// `/CFM` を取り出す。省略時は `/None`（ISO 32000-1 表 25 の既定値）。
///
/// `name` は所属する crypt filter エントリの名前。`/CF` に複数エントリがあるとき、
/// どのエントリの `/CFM` が壊れているかをエラーで指すために受け取る。
fn take_method(
    dictionary: &mut PdfDictionary,
    name: &PdfName,
    position: ByteOffset,
) -> Result<CryptFilterMethod, EncryptError> {
    let Some(value) = dictionary.remove(CryptFilterKey::CFM.as_bytes()) else {
        return Ok(CryptFilterMethod::None);
    };
    let actual = value.kind();
    // 引数の name（エントリ名）と区別するため、/CFM の値は method_name とする。
    let PdfObject::Name(method_name) = value else {
        return Err(EncryptError::invalid_key_type_at(
            position,
            EncryptKeyPath::CryptFilter {
                name: name.clone(),
                key: CryptFilterKey::CFM,
            },
            actual,
        ));
    };
    CryptFilterMethod::from_bytes(method_name.as_bytes())
        .ok_or_else(|| EncryptError::unknown_crypt_filter_method_at(position, method_name))
}

/// `/CF` エントリの `/Length` を検証済みの鍵長に解釈する。
///
/// ISO 32000-1 表 25 は `/CF` の `/Length` をバイト単位と規定するが、ビット単位で
/// 書く実装も存在する（`docs/specs/02b_encryption.md` §4）。バイト表記の定義域
/// 5..=16 とビット表記の定義域 40..=128 は重ならないため、値から単位を一意に決められる。
///
/// 解釈できない値（負値・`u16` 範囲外・どちらの表記としても成立しない値）は `None`。
/// `/AuthEvent` `/Length` はエラーにせず既定へフォールバックする方針（#607）に従い、
/// ここでエラーを返さないことで壊れた `/Length` 1 個が文書全体の解析を止めないようにする。
fn parse_length(raw: i64) -> Option<KeyLength> {
    let bits = match u16::try_from(raw).ok()? {
        bytes @ MIN_LENGTH_BYTES..=MAX_LENGTH_BYTES => bytes * BITS_PER_BYTE,
        bits => bits,
    };
    KeyLength::from_bits(bits)
}

#[cfg(test)]
mod tests {
    use super::{parse_length, AuthEvent, CryptFilterMethod};
    use crate::encrypt::algorithm::KeyLength;

    // ISO 32000-1 表 25 が定める 4 種の /CFM が対応するバリアントになることを確認する
    #[test]
    fn crypt_filter_method_from_bytes_maps_known_methods() {
        let cases: [(&[u8], CryptFilterMethod); 4] = [
            (b"None", CryptFilterMethod::None),
            (b"V2", CryptFilterMethod::V2),
            (b"AESV2", CryptFilterMethod::AesV2),
            (b"AESV3", CryptFilterMethod::AesV3),
        ];
        for (bytes, expected) in cases {
            assert_eq!(
                CryptFilterMethod::from_bytes(bytes),
                Some(expected),
                "/CFM {}",
                String::from_utf8_lossy(bytes)
            );
            assert_eq!(expected.as_str().as_bytes(), bytes);
        }
    }

    // 既知の集合に無い /CFM が None になることを確認する
    #[test]
    fn crypt_filter_method_from_bytes_rejects_unknown_method() {
        let cases: [&[u8]; 3] = [b"AESV9", b"", b"aesv2"];
        for bytes in cases {
            assert_eq!(
                CryptFilterMethod::from_bytes(bytes),
                None,
                "/CFM {}",
                String::from_utf8_lossy(bytes)
            );
        }
    }

    // /AuthEvent が /EFOpen のときだけ EFOpen になり、他は既定の DocOpen になることを確認する
    #[test]
    fn auth_event_from_bytes_defaults_to_doc_open() {
        assert_eq!(AuthEvent::from_bytes(b"EFOpen"), AuthEvent::EFOpen);
        assert_eq!(AuthEvent::from_bytes(b"DocOpen"), AuthEvent::DocOpen);
        assert_eq!(AuthEvent::from_bytes(b"Unknown"), AuthEvent::DocOpen);
    }

    // バイト表記（5..=16）が 8 倍されてビット表記の鍵長になることを確認する
    #[test]
    fn parse_length_normalizes_byte_notation() {
        let cases: [(i64, u16); 4] = [(5, 40), (8, 64), (13, 104), (16, 128)];
        for (raw, expected_bits) in cases {
            assert_eq!(
                parse_length(raw),
                KeyLength::from_bits(expected_bits),
                "/Length {raw} should be read as {expected_bits} bits"
            );
        }
    }

    // ビット表記（40..=128 かつ 8 の倍数）がそのまま鍵長になることを確認する
    #[test]
    fn parse_length_accepts_bit_notation() {
        // `as` キャストを避けるため、期待ビット数を u16 で明示する
        let cases: [(i64, u16); 4] = [(40, 40), (48, 48), (120, 120), (128, 128)];
        for (raw, expected_bits) in cases {
            assert_eq!(
                parse_length(raw),
                KeyLength::from_bits(expected_bits),
                "/Length {raw} should be read as {expected_bits} bits"
            );
        }
    }

    // どちらの表記としても成立しない値が None になることを確認する
    #[test]
    fn parse_length_rejects_uninterpretable_values() {
        let cases: [i64; 10] = [-8, -1, 0, 4, 17, 39, 41, 136, 200, i64::MAX];
        for raw in cases {
            assert_eq!(parse_length(raw), None, "/Length {raw} should be rejected");
        }
    }
}
