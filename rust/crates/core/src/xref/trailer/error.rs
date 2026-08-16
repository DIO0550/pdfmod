//! トレイラ解析専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。
//! `parser::error::ParseError` / `xref::error::XRefError` と同じフラット構造を採る。
//! 公開境界での `PdfError` への変換（`From` 実装）は後続 Issue に委ねる。
//!
//! [`ParseErrorKind`] を内包するため `Copy` は実装しない（`Clone` のみ）。

use crate::byte_offset::ByteOffset;
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
        /// 実際に読み取ったオブジェクトの種別ラベル。
        actual_kind: &'static str,
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
    InvalidKeyType {
        /// 対象のキー。
        key: TrailerKey,
        /// 実際に読み取った値の種別ラベル。
        ///
        /// `PdfObject` のバリアント名（`"Integer"` / `"Real"` 等）。
        /// 既存 `ParseErrorKind` の同名フィールドに揃えて `&'static str` を使う。
        actual_kind: &'static str,
    },
    /// バイトオフセット／サイズを表すキーの値が負の整数だった。
    NegativeValue {
        /// 対象のキー。
        key: TrailerKey,
    },
    /// `/ID` が「厳密に 2 要素の文字列配列」ではない。
    ///
    /// 配列でない・要素数が 2 でない・要素が文字列でない、をまとめて表す。
    InvalidIdArray,
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
    pub fn new(kind: TrailerErrorKind, position: ByteOffset) -> TrailerError {
        TrailerError { kind, position }
    }

    /// [`TrailerErrorKind::MissingTrailerKeyword`] を指定位置で構築する。
    pub fn missing_trailer_keyword_at(position: ByteOffset) -> TrailerError {
        TrailerError::new(TrailerErrorKind::MissingTrailerKeyword, position)
    }

    /// [`TrailerErrorKind::ObjectParseFailed`] を指定位置・委譲先エラー種別で構築する。
    pub fn object_parse_failed_at(position: ByteOffset, kind: ParseErrorKind) -> TrailerError {
        TrailerError::new(TrailerErrorKind::ObjectParseFailed { kind }, position)
    }

    /// [`TrailerErrorKind::NotADictionary`] を指定位置・実種別で構築する。
    pub fn not_a_dictionary_at(position: ByteOffset, actual_kind: &'static str) -> TrailerError {
        TrailerError::new(TrailerErrorKind::NotADictionary { actual_kind }, position)
    }

    /// [`TrailerErrorKind::MissingRequiredKey`] を指定位置・キーで構築する。
    pub fn missing_required_key_at(position: ByteOffset, key: TrailerKey) -> TrailerError {
        TrailerError::new(TrailerErrorKind::MissingRequiredKey { key }, position)
    }

    /// [`TrailerErrorKind::InvalidKeyType`] を指定位置・キー・実種別で構築する。
    pub fn invalid_key_type_at(
        position: ByteOffset,
        key: TrailerKey,
        actual_kind: &'static str,
    ) -> TrailerError {
        TrailerError::new(
            TrailerErrorKind::InvalidKeyType { key, actual_kind },
            position,
        )
    }

    /// [`TrailerErrorKind::NegativeValue`] を指定位置・キーで構築する。
    pub fn negative_value_at(position: ByteOffset, key: TrailerKey) -> TrailerError {
        TrailerError::new(TrailerErrorKind::NegativeValue { key }, position)
    }

    /// [`TrailerErrorKind::InvalidIdArray`] を指定位置で構築する。
    pub fn invalid_id_array_at(position: ByteOffset) -> TrailerError {
        TrailerError::new(TrailerErrorKind::InvalidIdArray, position)
    }
}

#[cfg(test)]
mod tests;
