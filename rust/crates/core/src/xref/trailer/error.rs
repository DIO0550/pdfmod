//! トレイラ解析専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。
//! `parser::error::ParseError` / `xref::error::XRefError` と同じフラット構造を採る。
//! 公開境界での `PdfError` への変換（`From` 実装）は後続 Issue に委ねる。
//!
//! [`ParseErrorKind`] と [`EncryptErrorKind`] を内包するため `Copy` は実装しない
//! （`Clone` のみ）。

use crate::byte_offset::ByteOffset;
use crate::encrypt::error::{EncryptError, EncryptErrorKind};
use crate::object::object_kind::ObjectKind;
use crate::parser::error::ParseErrorKind;
use crate::xref::trailer::key::TrailerKey;

/// トレイラ解析エラーの種別。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TrailerErrorKind {
    /// 指定位置（空白・コメントを飛ばした先）に `trailer` キーワードが無い。
    ///
    /// 開始位置が入力範囲外の場合、キーワード直後がトークン境界でない場合
    /// （`trailerX` 等）も含む。
    MissingTrailerKeyword,
    /// `trailer` キーワードの後のオブジェクトのパースに失敗した。
    ///
    /// 辞書が `>>` で閉じない、キーが名前でない、入力が尽きた等。
    /// 元の [`ParseErrorKind`] をそのまま保持する。
    ObjectParseFailed {
        /// 委譲先パーサが報告したエラー種別。
        kind: ParseErrorKind,
    },
    /// `trailer` キーワードの後が辞書ではなかった。
    NotADictionary {
        /// 実際に読み取ったオブジェクトの種別。
        actual: ObjectKind,
    },
    /// 必須キー（`/Size` / `/Root`）が辞書に無い。
    ///
    /// 値が `null` のエントリは辞書パース時に除去されるため（ISO §7.3.7）、
    /// `/Size null` もこのバリアントとして現れる。
    MissingRequiredKey {
        /// 欠落しているキー。
        key: TrailerKey,
    },
    /// キーの値が期待した型ではない。
    ///
    /// 型は合っているが値が範囲外の場合は [`Self::KeyValueOutOfRange`] を使う。
    InvalidKeyType {
        /// 対象のキー。
        key: TrailerKey,
        /// 実際に読み取った値の種別。
        actual: ObjectKind,
    },
    /// バイトオフセット／サイズを表すキーの値が負の整数だった。
    NegativeValue {
        /// 対象のキー。
        key: TrailerKey,
    },
    /// キーの値が非負 Integer だが `u64` に収まらない。
    ///
    /// 型不一致ではなく値域の問題であるため [`Self::InvalidKeyType`] とは分ける。
    /// `i64 → u64` は非負検証後なので理論上到達しないが、panic 不在契約の
    /// フォールバックとして残す。
    KeyValueOutOfRange {
        /// 対象のキー。
        key: TrailerKey,
        /// 実際に書かれていた値。
        value: i64,
    },
    /// `/ID` が「厳密に 2 要素の文字列配列」ではない。
    ///
    /// 配列でない・要素数が 2 でない・要素が文字列でない、をまとめて表す。
    InvalidIdArray,
    /// `/Encrypt` に直接書かれた暗号化辞書の構造が不正だった（#604）。
    ///
    /// 未対応のセキュリティハンドラ・未対応の `/V` はここには来ない
    /// （`EncryptDictionary::Unsupported` として成功で返る）。
    EncryptDictionaryInvalid {
        /// 委譲先の暗号化辞書解析が報告したエラー種別。
        kind: EncryptErrorKind,
    },
}

/// トレイラ解析エラー。位置情報を必須で保持する。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct TrailerError {
    /// エラーの種別と付随情報。
    pub kind: TrailerErrorKind,
    /// エラー発生位置（ファイル先頭からのバイトオフセット）。
    pub position: ByteOffset,
}

impl TrailerError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: TrailerErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// [`TrailerErrorKind::MissingTrailerKeyword`] を指定位置で構築する。
    pub fn missing_trailer_keyword_at(position: ByteOffset) -> Self {
        Self::new(TrailerErrorKind::MissingTrailerKeyword, position)
    }

    /// [`TrailerErrorKind::ObjectParseFailed`] を指定位置・委譲先エラー種別で構築する。
    pub fn object_parse_failed_at(position: ByteOffset, kind: ParseErrorKind) -> Self {
        Self::new(TrailerErrorKind::ObjectParseFailed { kind }, position)
    }

    /// [`TrailerErrorKind::NotADictionary`] を指定位置・実種別で構築する。
    pub fn not_a_dictionary_at(position: ByteOffset, actual: ObjectKind) -> Self {
        Self::new(TrailerErrorKind::NotADictionary { actual }, position)
    }

    /// [`TrailerErrorKind::MissingRequiredKey`] を指定位置・キーで構築する。
    pub fn missing_required_key_at(position: ByteOffset, key: TrailerKey) -> Self {
        Self::new(TrailerErrorKind::MissingRequiredKey { key }, position)
    }

    /// [`TrailerErrorKind::InvalidKeyType`] を指定位置・キー・実種別で構築する。
    pub fn invalid_key_type_at(position: ByteOffset, key: TrailerKey, actual: ObjectKind) -> Self {
        Self::new(TrailerErrorKind::InvalidKeyType { key, actual }, position)
    }

    /// [`TrailerErrorKind::NegativeValue`] を指定位置・キーで構築する。
    pub fn negative_value_at(position: ByteOffset, key: TrailerKey) -> Self {
        Self::new(TrailerErrorKind::NegativeValue { key }, position)
    }

    /// [`TrailerErrorKind::KeyValueOutOfRange`] を指定位置・キー・実値で構築する。
    pub fn key_value_out_of_range_at(position: ByteOffset, key: TrailerKey, value: i64) -> Self {
        Self::new(
            TrailerErrorKind::KeyValueOutOfRange { key, value },
            position,
        )
    }

    /// [`TrailerErrorKind::InvalidIdArray`] を指定位置で構築する。
    pub fn invalid_id_array_at(position: ByteOffset) -> Self {
        Self::new(TrailerErrorKind::InvalidIdArray, position)
    }

    /// [`TrailerErrorKind::EncryptDictionaryInvalid`] を委譲先エラーから構築する。
    ///
    /// 位置は引数で受け取らず、委譲先の [`EncryptError`] が保持している値を使う。
    /// 他の `*_at` と同じく位置を引数に取る形にすると、呼び出し側が委譲先エラーと
    /// 別の位置を渡せてしまい、報告位置が実際の検出位置と乖離しうるため
    /// （名前に `_at` を付けていないのはこの違いを示すため）。
    pub fn encrypt_dictionary_invalid(error: EncryptError) -> Self {
        let position = error.position();
        Self::new(
            TrailerErrorKind::EncryptDictionaryInvalid {
                kind: error.into_kind(),
            },
            position,
        )
    }
}

#[cfg(test)]
mod tests;
