//! 従来形式トレイラ（`trailer << … >>`）の表現と、辞書からの検証付き構築
//! （ISO 32000-1:2008 §7.5.5、`docs/specs/02_file_structure.md` §5）。
//!
//! 位置の特定とキーワード検証は [`parse`] サブモジュールが担う。本モジュールは
//! 「パース済みの辞書から主要キーを取り出し型を検証する」ところだけを受け持つ。
//!
//! # 検証の方針
//!
//! `/Size` `/Root` は必須。欠落・型不一致・負値はすべてエラーにする。
//! 任意キー（`/Prev` `/XRefStm` `/Info` `/ID` `/Encrypt`）は、存在する場合のみ
//! 型を検証し、不正なら素通しせずエラーにする。未知キーは無視して通す。
//!
//! 値が `PdfObject::Null` のエントリは辞書パースの時点で ISO §7.3.7 に従い
//! 除去されるため（`parser.rs`）、`/Size null` は型不一致ではなく
//! 「キー欠落」として現れる。
//!
//! # スコープ外
//!
//! `/Prev` を辿るチェーン走査（#589）、`/Root` の解決（Catalog 取得）、
//! `/XRefStm` が指す xref ストリームの読み込みは本モジュールの責務ではない。

pub mod error;
pub mod file_id;
pub mod key;
pub mod parse;

use crate::byte_offset::ByteOffset;
use crate::encrypt::EncryptDictionary;
use crate::object::dictionary::PdfDictionary;
use crate::object::indirect_ref::IndirectRef;
use crate::object::pdf_object::PdfObject;
use crate::xref::trailer::error::TrailerError;
use crate::xref::trailer::file_id::FileId;
use crate::xref::trailer::key::TrailerKey;

/// `/Encrypt` の値。間接参照と直接辞書の 2 形態を取りうる（ISO 32000-1 §7.6.1）。
///
/// 直接辞書の場合は [`EncryptDictionary`] として型に変換される（#604）。
/// 間接参照の場合はオブジェクト本体を読まないと中身が分からないため、
/// #585 と同じく参照のまま保持する。
///
/// [`EncryptDictionary`] が `Unsupported` で生辞書を保持しうるため、
/// `Eq` は実装できない（`PdfDictionary` は値に `Real(f64)` を持ちうる）。
// clippy の提案どおり `Dictionary` を `Box` に逃がすと、暗号化辞書は 1 ドキュメントに
// 高々 1 個なのでサイズ差の利得は 1 回分しかない一方、
// `EncryptValue::Dictionary(EncryptDictionary::Unsupported { .. })` のような
// 入れ子のパターンマッチが書けなくなる（`Box` は分解できない）。
#[expect(
    clippy::large_enum_variant,
    reason = "1 ドキュメントに 1 個のため Box 化の利得より入れ子 match の可読性を優先する（#604）"
)]
#[derive(Debug, Clone, PartialEq)]
pub enum EncryptValue {
    /// 暗号化辞書への間接参照。
    Reference(IndirectRef),
    /// 直接書かれた暗号化辞書。
    Dictionary(EncryptDictionary),
}

/// 従来形式トレイラから取り出した主要キー。
///
/// 必須キー（`/Size` `/Root`）は値型、任意キーは `Option<T>` で保持する。
///
/// 保持しないのは**トレイラ辞書そのもの**（未知キーを含む辞書全体）であり、
/// 未知キーへのアクセスが必要になった時点で追加する。ただし `Trailer` が
/// `PdfDictionary` を一切内包しないという意味ではない。`/Encrypt` は辞書を
/// 直接書ける唯一のキーで（ISO 32000-1 §7.6.1）、その形態が未対応ハンドラだった
/// 場合は [`EncryptDictionary::Unsupported`] が生の辞書を保持する。
///
/// この内包があるため `Eq` は derive できない（`PdfDictionary` は値に
/// `Real(f64)` を持ちうる）。`PartialEq` のみに留めている理由がこれ。
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub struct Trailer {
    size: u64,
    root: IndirectRef,
    prev: Option<ByteOffset>,
    xref_stm: Option<ByteOffset>,
    info: Option<IndirectRef>,
    id: Option<FileId>,
    encrypt: Option<EncryptValue>,
}

impl Trailer {
    /// パース済みの辞書から主要キーを取り出し、型を検証して `Trailer` を構築する。
    ///
    /// `dictionary` は所有で受け取り、値を `remove` でムーブする
    /// （`/ID` のバイト列と `/Encrypt` の辞書を clone しないため）。
    /// `position` はエラーに載せる位置で、辞書の開始オフセットを渡す
    /// （`resolve_stream_length` が `dict_start` に統一しているのと同方針）。
    ///
    /// # Errors
    ///
    /// - `MissingRequiredKey` — `/Size` または `/Root` が無い
    /// - `InvalidKeyType` — いずれかのキーが期待した型でない
    /// - `NegativeValue` — `/Size` `/Prev` `/XRefStm` が負の整数
    /// - `InvalidIdArray` — `/ID` が「2 要素の文字列配列」でない
    /// - `EncryptDictionaryInvalid` — `/Encrypt` に直接書かれた暗号化辞書の構造が不正
    pub fn from_dictionary(
        mut dictionary: PdfDictionary,
        position: ByteOffset,
    ) -> Result<Self, TrailerError> {
        let size = take_required_size(&mut dictionary, position)?;
        let root = take_required_reference(&mut dictionary, TrailerKey::Root, position)?;
        let prev = take_optional_offset(&mut dictionary, TrailerKey::Prev, position)?;
        let xref_stm = take_optional_offset(&mut dictionary, TrailerKey::XRefStm, position)?;
        let info = take_optional_reference(&mut dictionary, TrailerKey::Info, position)?;
        let id = take_optional_id(&mut dictionary, position)?;
        let encrypt = take_optional_encrypt(&mut dictionary, position)?;

        Ok(Self {
            size,
            root,
            prev,
            xref_stm,
            info,
            id,
            encrypt,
        })
    }

    /// `/Size`（最大オブジェクト番号 + 1）を返す。
    #[must_use]
    pub fn size(&self) -> u64 {
        self.size
    }

    /// `/Root`（ドキュメントカタログへの間接参照）を返す。
    pub fn root(&self) -> IndirectRef {
        self.root
    }

    /// `/Prev`（直前の xref セクションのオフセット）を返す。
    #[must_use]
    pub fn prev(&self) -> Option<ByteOffset> {
        self.prev
    }

    /// `/XRefStm`（ハイブリッド参照ファイルの xref ストリームのオフセット）を返す。
    #[must_use]
    pub fn xref_stm(&self) -> Option<ByteOffset> {
        self.xref_stm
    }

    /// `/Info`（文書情報辞書への間接参照）を返す。
    #[must_use]
    pub fn info(&self) -> Option<IndirectRef> {
        self.info
    }

    /// `/ID`（永続 ID と変更 ID のペア）を返す。
    ///
    /// 2 要素の意味の違いは [`FileId::permanent`] / [`FileId::changing`] で
    /// 区別する（ISO 32000-1 §14.4）。
    #[must_use]
    pub fn id(&self) -> Option<&FileId> {
        self.id.as_ref()
    }

    /// `/Encrypt`（暗号化辞書、またはその間接参照）を返す。
    #[must_use]
    pub fn encrypt(&self) -> Option<&EncryptValue> {
        self.encrypt.as_ref()
    }
}

/// `/Size` を取り出し、非負整数として `u64` に変換する。必須キー。
fn take_required_size(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<u64, TrailerError> {
    let key = TrailerKey::Size;
    let value = dictionary
        .remove(key.as_bytes())
        .ok_or_else(|| TrailerError::missing_required_key_at(position, key))?;

    match value {
        PdfObject::Integer(n) if n < 0 => Err(TrailerError::negative_value_at(position, key)),
        // n >= 0 が確定しているため try_from は全ターゲットで失敗しないが、
        // panic 不在契約のため unwrap せずエラーに落とす。
        PdfObject::Integer(n) => {
            u64::try_from(n).map_err(|_| TrailerError::key_value_out_of_range_at(position, key, n))
        }
        other => Err(TrailerError::invalid_key_type_at(
            position,
            key,
            other.kind(),
        )),
    }
}

/// 必須の間接参照キー（`/Root`）を取り出す。
fn take_required_reference(
    dictionary: &mut PdfDictionary,
    key: TrailerKey,
    position: ByteOffset,
) -> Result<IndirectRef, TrailerError> {
    let value = dictionary
        .remove(key.as_bytes())
        .ok_or_else(|| TrailerError::missing_required_key_at(position, key))?;

    match value {
        PdfObject::Reference(reference) => Ok(reference),
        other => Err(TrailerError::invalid_key_type_at(
            position,
            key,
            other.kind(),
        )),
    }
}

/// 任意のバイトオフセットキー（`/Prev` `/XRefStm`）を取り出す。
fn take_optional_offset(
    dictionary: &mut PdfDictionary,
    key: TrailerKey,
    position: ByteOffset,
) -> Result<Option<ByteOffset>, TrailerError> {
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Ok(None);
    };

    match value {
        PdfObject::Integer(n) if n < 0 => Err(TrailerError::negative_value_at(position, key)),
        // take_required_size と同じく、n >= 0 が確定しているため try_from は失敗しない。
        PdfObject::Integer(n) => u64::try_from(n)
            .map(|offset| Some(ByteOffset::new(offset)))
            .map_err(|_| TrailerError::key_value_out_of_range_at(position, key, n)),
        other => Err(TrailerError::invalid_key_type_at(
            position,
            key,
            other.kind(),
        )),
    }
}

/// 任意の間接参照キー（`/Info`）を取り出す。
fn take_optional_reference(
    dictionary: &mut PdfDictionary,
    key: TrailerKey,
    position: ByteOffset,
) -> Result<Option<IndirectRef>, TrailerError> {
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Ok(None);
    };

    match value {
        PdfObject::Reference(reference) => Ok(Some(reference)),
        other => Err(TrailerError::invalid_key_type_at(
            position,
            key,
            other.kind(),
        )),
    }
}

/// `/ID` を取り出す。厳密に 2 要素の文字列配列であることを要求する。
///
/// 要素数と要素型の検証は [`FileId::from_array`] が担い、本関数は
/// 「値が配列であること」の確認と、失敗への位置情報の付与だけを行う。
fn take_optional_id(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<Option<FileId>, TrailerError> {
    let Some(value) = dictionary.remove(TrailerKey::Id.as_bytes()) else {
        return Ok(None);
    };

    let PdfObject::Array(elements) = value else {
        return Err(TrailerError::invalid_id_array_at(position));
    };

    FileId::from_array(elements)
        .map(Some)
        .ok_or_else(|| TrailerError::invalid_id_array_at(position))
}

/// `/Encrypt` を取り出す。間接参照と直接辞書の 2 形態を許す。
///
/// 直接辞書は [`EncryptDictionary::from_dictionary`] で型に変換する。
/// 未対応のセキュリティハンドラ・未対応の `/V` は `EncryptDictionary::Unsupported`
/// になり、エラーにはならない（#604）。
fn take_optional_encrypt(
    dictionary: &mut PdfDictionary,
    position: ByteOffset,
) -> Result<Option<EncryptValue>, TrailerError> {
    let key = TrailerKey::Encrypt;
    let Some(value) = dictionary.remove(key.as_bytes()) else {
        return Ok(None);
    };

    match value {
        PdfObject::Reference(reference) => Ok(Some(EncryptValue::Reference(reference))),
        PdfObject::Dictionary(encrypt) => {
            let encrypt = EncryptDictionary::from_dictionary(encrypt, position)
                .map_err(TrailerError::encrypt_dictionary_invalid)?;
            Ok(Some(EncryptValue::Dictionary(encrypt)))
        }
        other => Err(TrailerError::invalid_key_type_at(
            position,
            key,
            other.kind(),
        )),
    }
}
