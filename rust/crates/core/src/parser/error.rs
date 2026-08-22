//! parser モジュール専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。
//! 「期待した型と違う値が来た」ことを表す `actual` には [`ObjectKind`] / [`TokenKind`]
//! を載せる。文字列では網羅 match が書けず、`PdfObject` に実在しないバリアント名を
//! 種別として混入させられてしまうため（#610）。
//! 将来的に公開境界では `From<ParseError> for PdfError` 経由で
//! 上位エラー型に変換できるよう、構造はフラットに保つ。

use crate::byte_offset::ByteOffset;
use crate::lexer::token_kind::TokenKind;
use crate::object::object_kind::ObjectKind;

/// パースエラーの種別。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseErrorKind {
    /// 入力が尽きた状態でオブジェクトを要求された。
    UnexpectedEof,
    /// スカラでないトークンが来た（配列開始・辞書開始・キーワード等）。
    UnexpectedToken {
        /// 受け取ったトークンの種別。
        actual: TokenKind,
    },
    /// lexer が `None` を返した（malformed input）。入力末端ではない場合に発生する。
    LexerError,
    /// ストリーム辞書に `/Length` エントリが存在しない。
    MissingLength,
    /// `/Length` が間接参照 `N G R` になっている（Epic R2 で解決される予定）。
    IndirectLengthNotSupported,
    /// `/Length` が Integer 以外の型（Real / String / Name / Array / Dictionary / Boolean など）。
    ///
    /// Integer だが `usize` に収まらない場合は本バリアントではなく
    /// [`Self::LengthOutOfRange`] として現れる。
    /// 値が `Null` の場合は辞書パース時に ISO §7.3.7 に従いエントリ自体が削除されるため、
    /// `/Length null` は [`Self::MissingLength`] として現れる。
    InvalidLengthType {
        /// 実際に受け取った値の種別。
        actual: ObjectKind,
    },
    /// `/Length` が Integer だが負の値。
    NegativeLength,
    /// `/Length` が非負 Integer だが `usize` に収まらない
    /// （32bit ターゲットで `usize::try_from` が失敗する場合。panic 不在契約のフォールバック）。
    LengthOutOfRange {
        /// 実際に書かれていた値。
        value: i64,
    },
    /// `stream` キーワード直後が CRLF/LF 以外（CR 単体・SP・TAB・EOF など）。
    InvalidStreamEol,
    /// `Length` バイト消費後に `endstream` トークンが無い。
    MissingEndstream,
}

/// パースエラー。位置情報を必須で保持する。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct ParseError {
    /// エラーの種別と付随情報。
    pub kind: ParseErrorKind,
    /// エラー発生位置（バイトオフセット）。
    pub position: ByteOffset,
}

impl ParseError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: ParseErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// [`ParseErrorKind::UnexpectedEof`] を指定位置で構築する便利コンストラクタ。
    pub fn unexpected_eof_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::UnexpectedEof,
            position,
        }
    }

    /// [`ParseErrorKind::UnexpectedToken`] を指定位置・トークン種別で構築する便利コンストラクタ。
    pub fn unexpected_token_at(position: ByteOffset, actual: TokenKind) -> Self {
        Self {
            kind: ParseErrorKind::UnexpectedToken { actual },
            position,
        }
    }

    /// [`ParseErrorKind::LexerError`] を指定位置で構築する便利コンストラクタ。
    pub fn lexer_error_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::LexerError,
            position,
        }
    }

    /// [`ParseErrorKind::MissingLength`] を指定位置で構築する便利コンストラクタ。
    pub fn missing_length_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::MissingLength,
            position,
        }
    }

    /// [`ParseErrorKind::IndirectLengthNotSupported`] を指定位置で構築する便利コンストラクタ。
    pub fn indirect_length_not_supported_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::IndirectLengthNotSupported,
            position,
        }
    }

    /// [`ParseErrorKind::InvalidLengthType`] を指定位置・オブジェクト種別で構築する便利コンストラクタ。
    pub fn invalid_length_type_at(position: ByteOffset, actual: ObjectKind) -> Self {
        Self {
            kind: ParseErrorKind::InvalidLengthType { actual },
            position,
        }
    }

    /// [`ParseErrorKind::LengthOutOfRange`] を指定位置・実値で構築する便利コンストラクタ。
    pub fn length_out_of_range_at(position: ByteOffset, value: i64) -> Self {
        Self {
            kind: ParseErrorKind::LengthOutOfRange { value },
            position,
        }
    }

    /// [`ParseErrorKind::NegativeLength`] を指定位置で構築する便利コンストラクタ。
    pub fn negative_length_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::NegativeLength,
            position,
        }
    }

    /// [`ParseErrorKind::InvalidStreamEol`] を指定位置で構築する便利コンストラクタ。
    pub fn invalid_stream_eol_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::InvalidStreamEol,
            position,
        }
    }

    /// [`ParseErrorKind::MissingEndstream`] を指定位置で構築する便利コンストラクタ。
    pub fn missing_endstream_at(position: ByteOffset) -> Self {
        Self {
            kind: ParseErrorKind::MissingEndstream,
            position,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_constructs_with_given_kind_and_position() {
        // 任意の kind と position を渡して new で構築すると、両フィールドが透過保持されることを確認する
        let err = ParseError::new(ParseErrorKind::UnexpectedEof, ByteOffset::new(7));
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
        assert_eq!(err.position, ByteOffset::new(7));
    }

    #[test]
    fn unexpected_eof_at_constructs_unexpected_eof_kind() {
        // unexpected_eof_at が UnexpectedEof バリアントを kind に持ち、position を保持することを確認する
        let err = ParseError::unexpected_eof_at(ByteOffset::new(42));
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
        assert_eq!(err.position, ByteOffset::new(42));
    }

    #[test]
    fn unexpected_token_at_constructs_with_actual_token_kind() {
        // unexpected_token_at が UnexpectedToken { actual } を保持し、position も透過することを確認する
        let err = ParseError::unexpected_token_at(ByteOffset::new(3), TokenKind::ArrayBegin);
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::ArrayBegin
            }
        );
        assert_eq!(err.position, ByteOffset::new(3));
    }

    #[test]
    fn lexer_error_at_constructs_lexer_error_kind() {
        // lexer_error_at が LexerError バリアントを kind に持ち、position も透過することを確認する
        let err = ParseError::lexer_error_at(ByteOffset::new(5));
        assert_eq!(err.kind, ParseErrorKind::LexerError);
        assert_eq!(err.position, ByteOffset::new(5));
    }

    #[test]
    fn position_can_be_zero() {
        // position に 0 を指定した ParseError がそのまま保持されることを確認する
        let err = ParseError::unexpected_eof_at(ByteOffset::new(0));
        assert_eq!(err.position, ByteOffset::new(0));
    }

    #[test]
    fn position_can_be_u64_max() {
        // position に u64::MAX を指定した ParseError がそのまま保持されることを確認する
        let err = ParseError::lexer_error_at(ByteOffset::new(u64::MAX));
        assert_eq!(err.position, ByteOffset::new(u64::MAX));
    }

    #[test]
    fn same_kind_and_position_are_equal() {
        // 同じ kind と position で構築した 2 つの ParseError が PartialEq で == となることを確認する
        let a = ParseError::unexpected_token_at(ByteOffset::new(10), TokenKind::DictBegin);
        let b = ParseError::unexpected_token_at(ByteOffset::new(10), TokenKind::DictBegin);
        assert_eq!(a, b);
    }

    #[test]
    fn different_kind_are_not_equal() {
        // 同位置でも kind が異なる UnexpectedEof と LexerError が != と判定されることを確認する
        let eof = ParseError::unexpected_eof_at(ByteOffset::new(1));
        let lex = ParseError::lexer_error_at(ByteOffset::new(1));
        assert_ne!(eof, lex);
    }

    #[test]
    fn different_actual_token_kind_are_not_equal() {
        // UnexpectedToken の actual が異なる 2 つが != と判定されることを確認する
        let a = ParseError::unexpected_token_at(ByteOffset::new(0), TokenKind::ArrayBegin);
        let b = ParseError::unexpected_token_at(ByteOffset::new(0), TokenKind::DictBegin);
        assert_ne!(a, b);
    }

    #[test]
    fn missing_length_at_constructs_missing_length_kind() {
        // missing_length_at が MissingLength バリアントを kind に持ち、position も透過することを確認する
        let err = ParseError::missing_length_at(ByteOffset::new(11));
        assert_eq!(err.kind, ParseErrorKind::MissingLength);
        assert_eq!(err.position, ByteOffset::new(11));
    }

    #[test]
    fn indirect_length_not_supported_at_constructs_indirect_length_kind() {
        // indirect_length_not_supported_at が IndirectLengthNotSupported バリアントを持ち、position も透過することを確認する
        let err = ParseError::indirect_length_not_supported_at(ByteOffset::new(21));
        assert_eq!(err.kind, ParseErrorKind::IndirectLengthNotSupported);
        assert_eq!(err.position, ByteOffset::new(21));
    }

    #[test]
    fn invalid_length_type_at_constructs_with_actual_object_kind() {
        // invalid_length_type_at が InvalidLengthType { actual } を保持し、position も透過することを確認する
        let err = ParseError::invalid_length_type_at(ByteOffset::new(31), ObjectKind::Real);
        assert_eq!(
            err.kind,
            ParseErrorKind::InvalidLengthType {
                actual: ObjectKind::Real
            }
        );
        assert_eq!(err.position, ByteOffset::new(31));
    }

    #[test]
    fn length_out_of_range_at_constructs_with_value() {
        // length_out_of_range_at が LengthOutOfRange { value } を保持し、position も透過することを確認する
        let err = ParseError::length_out_of_range_at(ByteOffset::new(33), i64::MAX);
        assert_eq!(
            err.kind,
            ParseErrorKind::LengthOutOfRange { value: i64::MAX }
        );
        assert_eq!(err.position, ByteOffset::new(33));
    }

    #[test]
    fn length_out_of_range_is_distinct_from_invalid_length_type() {
        // 値域エラーと型不一致エラーが別バリアントとして区別されることを確認する
        let out_of_range = ParseError::length_out_of_range_at(ByteOffset::new(0), i64::MAX);
        let wrong_type =
            ParseError::invalid_length_type_at(ByteOffset::new(0), ObjectKind::Integer);
        assert_ne!(out_of_range, wrong_type);
    }

    #[test]
    fn negative_length_at_constructs_negative_length_kind() {
        // negative_length_at が NegativeLength バリアントを kind に持ち、position も透過することを確認する
        let err = ParseError::negative_length_at(ByteOffset::new(41));
        assert_eq!(err.kind, ParseErrorKind::NegativeLength);
        assert_eq!(err.position, ByteOffset::new(41));
    }

    #[test]
    fn invalid_stream_eol_at_constructs_invalid_stream_eol_kind() {
        // invalid_stream_eol_at が InvalidStreamEol バリアントを kind に持ち、position も透過することを確認する
        let err = ParseError::invalid_stream_eol_at(ByteOffset::new(51));
        assert_eq!(err.kind, ParseErrorKind::InvalidStreamEol);
        assert_eq!(err.position, ByteOffset::new(51));
    }

    #[test]
    fn missing_endstream_at_constructs_missing_endstream_kind() {
        // missing_endstream_at が MissingEndstream バリアントを kind に持ち、position も透過することを確認する
        let err = ParseError::missing_endstream_at(ByteOffset::new(61));
        assert_eq!(err.kind, ParseErrorKind::MissingEndstream);
        assert_eq!(err.position, ByteOffset::new(61));
    }

    #[test]
    fn invalid_length_type_different_actual_object_kind_are_not_equal() {
        // InvalidLengthType の actual が異なる 2 つが != と判定されることを確認する
        let a = ParseError::invalid_length_type_at(ByteOffset::new(0), ObjectKind::Real);
        let b = ParseError::invalid_length_type_at(ByteOffset::new(0), ObjectKind::Name);
        assert_ne!(a, b);
    }
}
