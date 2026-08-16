//! xref 解析専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。
//! `parser::error::ParseError` と同じフラット構造を採り、
//! 公開境界での `PdfError` への変換（`From` 実装）は後続 Issue に委ねる。

use crate::byte_offset::ByteOffset;

/// xref 解析エラーの種別。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum XRefErrorKind {
    /// 指定位置（空白・コメントを飛ばした先）に `xref` キーワードが無い。
    ///
    /// キーワード直後がトークン境界でない場合（`xrefs` 等）も含む。
    MissingXRefKeyword,
    /// サブセクションヘッダ `<先頭オブジェクト番号> <エントリ数>` が読めない。
    ///
    /// 数字が無い・`u64` を超える・「先頭番号 + 件数」が `u64` を超える場合。
    InvalidSubsectionHeader,
    /// エントリのオフセット欄／世代番号欄が 10 進整数として読めない。
    ///
    /// 数字が 1 桁も無い、数字直後が regular バイト（`17a` 等）、`u64` を超える場合。
    InvalidNumber,
    /// エントリの状態フラグが `n` / `f` のどちらでもない。
    InvalidEntryFlag {
        /// 実際に読み取ったバイト。
        actual: u8,
    },
    /// 世代番号が `GenerationNumber` の内部型 `u16` の上限 65535 を超えている。
    ///
    /// 意味的な妥当性検証ではなく、型に載らない値の表現不能を報告する。
    GenerationOutOfRange {
        /// 実際に読み取った世代番号の値。
        value: u64,
    },
    /// 宣言された件数ぶんのエントリを読み切る前に入力が尽きた。
    UnexpectedEof,
}

/// xref 解析エラー。位置情報を必須で保持する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct XRefError {
    /// エラーの種別と付随情報。
    pub kind: XRefErrorKind,
    /// エラー発生位置（ファイル先頭からのバイトオフセット）。
    pub position: ByteOffset,
}

impl XRefError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: XRefErrorKind, position: ByteOffset) -> XRefError {
        XRefError { kind, position }
    }

    /// [`XRefErrorKind::MissingXRefKeyword`] を指定位置で構築する。
    pub fn missing_xref_keyword_at(position: ByteOffset) -> XRefError {
        XRefError::new(XRefErrorKind::MissingXRefKeyword, position)
    }

    /// [`XRefErrorKind::InvalidSubsectionHeader`] を指定位置で構築する。
    pub fn invalid_subsection_header_at(position: ByteOffset) -> XRefError {
        XRefError::new(XRefErrorKind::InvalidSubsectionHeader, position)
    }

    /// [`XRefErrorKind::InvalidNumber`] を指定位置で構築する。
    pub fn invalid_number_at(position: ByteOffset) -> XRefError {
        XRefError::new(XRefErrorKind::InvalidNumber, position)
    }

    /// [`XRefErrorKind::InvalidEntryFlag`] を指定位置・実バイトで構築する。
    pub fn invalid_entry_flag_at(position: ByteOffset, actual: u8) -> XRefError {
        XRefError::new(XRefErrorKind::InvalidEntryFlag { actual }, position)
    }

    /// [`XRefErrorKind::GenerationOutOfRange`] を指定位置・実値で構築する。
    pub fn generation_out_of_range_at(position: ByteOffset, value: u64) -> XRefError {
        XRefError::new(XRefErrorKind::GenerationOutOfRange { value }, position)
    }

    /// [`XRefErrorKind::UnexpectedEof`] を指定位置で構築する。
    pub fn unexpected_eof_at(position: ByteOffset) -> XRefError {
        XRefError::new(XRefErrorKind::UnexpectedEof, position)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // new が渡した kind と position を透過保持することを確認する
    #[test]
    fn new_constructs_with_given_kind_and_position() {
        let error = XRefError::new(XRefErrorKind::UnexpectedEof, ByteOffset::new(7));
        assert_eq!(error.kind, XRefErrorKind::UnexpectedEof);
        assert_eq!(error.position, ByteOffset::new(7));
    }

    // 各 *_at コンストラクタが対応する kind を持ち、position を透過することを確認する
    #[test]
    fn convenience_constructors_set_expected_kind() {
        let position = ByteOffset::new(42);
        let cases: [(XRefError, XRefErrorKind); 6] = [
            (
                XRefError::missing_xref_keyword_at(position),
                XRefErrorKind::MissingXRefKeyword,
            ),
            (
                XRefError::invalid_subsection_header_at(position),
                XRefErrorKind::InvalidSubsectionHeader,
            ),
            (
                XRefError::invalid_number_at(position),
                XRefErrorKind::InvalidNumber,
            ),
            (
                XRefError::invalid_entry_flag_at(position, b'x'),
                XRefErrorKind::InvalidEntryFlag { actual: b'x' },
            ),
            (
                XRefError::generation_out_of_range_at(position, 99999),
                XRefErrorKind::GenerationOutOfRange { value: 99999 },
            ),
            (
                XRefError::unexpected_eof_at(position),
                XRefErrorKind::UnexpectedEof,
            ),
        ];
        for (error, expected_kind) in cases {
            assert_eq!(error.kind, expected_kind, "kind: {expected_kind:?}");
            assert_eq!(error.position, position, "position: {expected_kind:?}");
        }
    }

    // position の境界値（0 と u64::MAX）がそのまま保持されることを確認する
    #[test]
    fn position_boundary_values_are_preserved() {
        assert_eq!(
            XRefError::unexpected_eof_at(ByteOffset::new(0)).position,
            ByteOffset::new(0)
        );
        assert_eq!(
            XRefError::unexpected_eof_at(ByteOffset::new(u64::MAX)).position,
            ByteOffset::new(u64::MAX)
        );
    }

    // 同じ kind・position なら等価、kind か position が違えば非等価であることを確認する
    #[test]
    fn equality_follows_kind_and_position() {
        let a = XRefError::invalid_entry_flag_at(ByteOffset::new(10), b'x');
        let b = XRefError::invalid_entry_flag_at(ByteOffset::new(10), b'x');
        let different_actual = XRefError::invalid_entry_flag_at(ByteOffset::new(10), b'y');
        let different_position = XRefError::invalid_entry_flag_at(ByteOffset::new(11), b'x');
        assert_eq!(a, b);
        assert_ne!(a, different_actual);
        assert_ne!(a, different_position);
    }
}
