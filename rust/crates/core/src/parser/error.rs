//! parser モジュール専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。
//! `actual_kind` は `&'static str` を採用し、`PartialEq`/`Eq` を簡潔に保つ。
//! 将来的に公開境界では `From<ParseError> for PdfError` 経由で
//! 上位エラー型に変換できるよう、構造はフラットに保つ。

use crate::byte_offset::ByteOffset;

/// パースエラーの種別。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ParseErrorKind {
    /// 入力が尽きた状態でオブジェクトを要求された。
    UnexpectedEof,
    /// スカラでないトークンが来た（配列開始・辞書開始・キーワード等）。
    UnexpectedToken {
        /// 受け取ったトークンを表す短い識別子。
        /// 例: `"ArrayBegin"` / `"DictBegin"` / `"Keyword"` / `"ObjBegin"` 等。
        actual_kind: &'static str,
    },
    /// lexer が `None` を返した（malformed input）。入力末端ではない場合に発生する。
    LexerError,
}

/// パースエラー。位置情報を必須で保持する。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParseError {
    /// エラーの種別と付随情報。
    pub kind: ParseErrorKind,
    /// エラー発生位置（バイトオフセット）。
    pub position: ByteOffset,
}

impl ParseError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: ParseErrorKind, position: ByteOffset) -> ParseError {
        ParseError { kind, position }
    }

    /// [`ParseErrorKind::UnexpectedEof`] を指定位置で構築する便利コンストラクタ。
    pub fn unexpected_eof_at(position: ByteOffset) -> ParseError {
        ParseError {
            kind: ParseErrorKind::UnexpectedEof,
            position,
        }
    }

    /// [`ParseErrorKind::UnexpectedToken`] を指定位置・トークン識別子で構築する便利コンストラクタ。
    pub fn unexpected_token_at(position: ByteOffset, actual_kind: &'static str) -> ParseError {
        ParseError {
            kind: ParseErrorKind::UnexpectedToken { actual_kind },
            position,
        }
    }

    /// [`ParseErrorKind::LexerError`] を指定位置で構築する便利コンストラクタ。
    pub fn lexer_error_at(position: ByteOffset) -> ParseError {
        ParseError {
            kind: ParseErrorKind::LexerError,
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
    fn unexpected_token_at_constructs_with_actual_kind() {
        // unexpected_token_at が UnexpectedToken { actual_kind } を保持し、position も透過することを確認する
        let err = ParseError::unexpected_token_at(ByteOffset::new(3), "ArrayBegin");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "ArrayBegin"
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
        let a = ParseError::unexpected_token_at(ByteOffset::new(10), "DictBegin");
        let b = ParseError::unexpected_token_at(ByteOffset::new(10), "DictBegin");
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
    fn different_actual_kind_are_not_equal() {
        // UnexpectedToken の actual_kind が異なる 2 つが != と判定されることを確認する
        let a = ParseError::unexpected_token_at(ByteOffset::new(0), "ArrayBegin");
        let b = ParseError::unexpected_token_at(ByteOffset::new(0), "DictBegin");
        assert_ne!(a, b);
    }
}
