//! PDF 処理で発生したエラーを文脈付きで表す `PdfError` を定義するモジュール。
//!
//! エラー種別 `PdfErrorCode`(#259) に、発生位置 `ByteOffset`(#257) と補足メッセージを
//! 任意で添えて束ねる「文脈付きエラー値」。`Result<T, PdfError>` の失敗側として返し、
//! panic ではなく型でエラーを伝播するための基盤型（Issue #260, Epic #251）。
//!
//! 設計意図:
//! - `position` / `message` は両方 `Option`（位置不明・メッセージ不要なエラーも表現可能）。
//! - `message` は所有 `String`（`format!` で動的に値・期待トークン等を埋め込める。std のみで完結）。
//! - 構築はビルダー風: `new(code)` を基点に `with_position` / `with_message` を任意で重ねる。
//! - `Copy` は付与しない（`String` を保持するため不可）。`Debug, Clone, PartialEq, Eq` のみ derive。
//! - `Display` を手実装し、種別部分は `PdfErrorCode` の `Display` に委譲する
//!   （人間可読な英語短文を出力）。位置・メッセージは Some のときだけ連結し、
//!   None の要素は記号ごと省略する。
//! - `std::error::Error` を実装する（`Box<dyn Error>` と相互運用可能）。`source()` は当面
//!   下位エラーを保持しないためデフォルト実装（`None`）のままとする。
//! - 外部 crate 依存ゼロ（`thiserror` 等は使わず std のみで実装）。

use std::error::Error;
use std::fmt;

use crate::byte_offset::ByteOffset;
use crate::error::pdf_error_code::PdfErrorCode;

/// PDF 処理で発生したエラーを種別・位置・メッセージで表す文脈付きエラー値。
///
/// `code` は必須、`position` と `message` は任意（`Option`）。`Result<T, PdfError>` の
/// `E` として用いる。`String` を保持するため `Copy` は持たない。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PdfError {
    code: PdfErrorCode,
    position: Option<ByteOffset>,
    message: Option<String>,
}

impl PdfError {
    /// エラー種別 `code` のみを持つ `PdfError` を生成する。
    ///
    /// 位置・メッセージは `None`。必要に応じて `with_position` / `with_message` で付与する。
    pub fn new(code: PdfErrorCode) -> PdfError {
        PdfError {
            code,
            position: None,
            message: None,
        }
    }

    /// 発生位置 `position` を付与した `PdfError` を返す（ビルダー風、self を消費）。
    ///
    /// 複数回呼び出した場合は**後勝ち**で上書きする（最後に渡した値が残る）。
    pub fn with_position(mut self, position: ByteOffset) -> PdfError {
        self.position = Some(position);
        self
    }

    /// 補足メッセージ `message` を付与した `PdfError` を返す（ビルダー風、self を消費）。
    ///
    /// `impl Into<String>` を受け、`&str` / `String` / `format!` の結果をそのまま渡せる。
    /// 無検証（空文字列もそのまま受理する）。複数回呼び出した場合は**後勝ち**で上書きする。
    pub fn with_message(mut self, message: impl Into<String>) -> PdfError {
        self.message = Some(message.into());
        self
    }

    /// エラー種別を返す（`PdfErrorCode` は `Copy` のため値返し）。
    pub fn code(&self) -> PdfErrorCode {
        self.code
    }

    /// 発生位置を返す（未設定なら `None`。`ByteOffset` は `Copy` のため値返し）。
    pub fn position(&self) -> Option<ByteOffset> {
        self.position
    }

    /// 補足メッセージを `Option<&str>` として返す（未設定なら `None`）。
    pub fn message(&self) -> Option<&str> {
        self.message.as_deref()
    }
}

impl fmt::Display for PdfError {
    /// `PdfErrorCode` の `Display` 出力（人間可読な英語短文）を基点に、
    /// position があれば " at byte N"、message があれば ": <message>" を連結する。
    /// None の要素は記号ごと省略し、余分な記号を出さない。
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)?;
        if let Some(position) = self.position {
            write!(f, " at byte {}", position)?;
        }
        if let Some(message) = &self.message {
            write!(f, ": {}", message)?;
        }
        Ok(())
    }
}

impl Error for PdfError {
    // source() はデフォルト実装（None）のまま。下位エラーの連鎖は後続 Issue で対応する。
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_sets_code_and_leaves_position_and_message_none() {
        // new(code) のみで構築すると code() は指定種別を返し、position()/message() は None。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof);
        assert_eq!(err.code(), PdfErrorCode::UnexpectedEof);
        assert_eq!(err.position(), None);
        assert_eq!(err.message(), None);
    }

    #[test]
    fn with_position_sets_position() {
        // with_position で位置を付与すると position() が Some(指定 ByteOffset) を返す。
        let err = PdfError::new(PdfErrorCode::UnexpectedToken).with_position(ByteOffset::new(12));
        assert_eq!(err.position(), Some(ByteOffset::new(12)));
        assert_eq!(err.message(), None);
    }

    #[test]
    fn with_message_sets_message() {
        // with_message でメッセージを付与すると message() が Some(指定文字列) を返す。
        let err = PdfError::new(PdfErrorCode::InvalidNumber).with_message("bad number");
        assert_eq!(err.message(), Some("bad number"));
        assert_eq!(err.position(), None);
    }

    #[test]
    fn builder_chain_sets_all_fields() {
        // with_position と with_message を連鎖すると全フィールドが指定値を返す。
        let err = PdfError::new(PdfErrorCode::InvalidSyntax)
            .with_position(ByteOffset::new(7))
            .with_message("oops");
        assert_eq!(err.code(), PdfErrorCode::InvalidSyntax);
        assert_eq!(err.position(), Some(ByteOffset::new(7)));
        assert_eq!(err.message(), Some("oops"));
    }

    #[test]
    fn with_message_accepts_into_string_sources() {
        // with_message は &str / String / format! 結果（impl Into<String>）を受理できる。
        let from_str = PdfError::new(PdfErrorCode::UnexpectedEof).with_message("literal");
        let from_string =
            PdfError::new(PdfErrorCode::UnexpectedEof).with_message(String::from("owned"));
        let from_format =
            PdfError::new(PdfErrorCode::UnexpectedEof).with_message(format!("tok={}", 1));
        assert_eq!(from_str.message(), Some("literal"));
        assert_eq!(from_string.message(), Some("owned"));
        assert_eq!(from_format.message(), Some("tok=1"));
    }

    #[test]
    fn builder_methods_overwrite_with_last_value() {
        // with_position/with_message を複数回呼ぶと後勝ちで最後の値が残る。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof)
            .with_position(ByteOffset::new(1))
            .with_position(ByteOffset::new(2))
            .with_message("first")
            .with_message("last");
        assert_eq!(err.position(), Some(ByteOffset::new(2)));
        assert_eq!(err.message(), Some("last"));
    }

    #[test]
    fn display_with_code_only() {
        // position/message なしのときは種別名のみを出力し、余分な記号を出さない。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof);
        assert_eq!(format!("{}", err), "unexpected end of file");
    }

    #[test]
    fn display_with_position() {
        // position ありのときは " at byte N" を連結する。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof).with_position(ByteOffset::new(12));
        assert_eq!(format!("{}", err), "unexpected end of file at byte 12");
    }

    #[test]
    fn display_with_message_only() {
        // message のみのときは ": <message>" を連結し、" at byte" は出さない。
        let err = PdfError::new(PdfErrorCode::UnexpectedToken).with_message("unexpected");
        assert_eq!(format!("{}", err), "unexpected token: unexpected");
    }

    #[test]
    fn display_with_all_fields() {
        // 全要素ありのときは "{code} at byte N: <message>" 形式になる。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof)
            .with_position(ByteOffset::new(12))
            .with_message("eof");
        assert_eq!(format!("{}", err), "unexpected end of file at byte 12: eof");
    }

    #[test]
    fn display_with_empty_message() {
        // 空文字列メッセージ Some("") を無検証で受理し ":" の後が空になる。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof).with_message("");
        assert_eq!(err.message(), Some(""));
        assert_eq!(format!("{}", err), "unexpected end of file: ");
    }

    #[test]
    fn equal_errors_are_equal() {
        // 同一の code/position/message を持つ 2 値は == で等価になる。
        let a = PdfError::new(PdfErrorCode::InvalidSyntax).with_position(ByteOffset::new(1));
        let b = PdfError::new(PdfErrorCode::InvalidSyntax).with_position(ByteOffset::new(1));
        assert_eq!(a, b);
    }

    #[test]
    fn errors_differing_in_any_field_are_not_equal() {
        // code / position / message のいずれかが異なれば != で非等価になる。
        let base = PdfError::new(PdfErrorCode::InvalidSyntax)
            .with_position(ByteOffset::new(1))
            .with_message("m");
        // code 違い
        assert_ne!(
            base,
            PdfError::new(PdfErrorCode::InvalidNumber)
                .with_position(ByteOffset::new(1))
                .with_message("m")
        );
        // position 違い（Some(1) ↔ Some(2) の値違い）
        assert_ne!(
            base,
            PdfError::new(PdfErrorCode::InvalidSyntax)
                .with_position(ByteOffset::new(2))
                .with_message("m")
        );
        // position 違い（Some ↔ None）
        assert_ne!(
            base,
            PdfError::new(PdfErrorCode::InvalidSyntax).with_message("m")
        );
        // message 違い（"m" ↔ "n" の値違い）
        assert_ne!(
            base,
            PdfError::new(PdfErrorCode::InvalidSyntax)
                .with_position(ByteOffset::new(1))
                .with_message("n")
        );
        // message 違い（Some ↔ None）
        assert_ne!(
            base,
            PdfError::new(PdfErrorCode::InvalidSyntax).with_position(ByteOffset::new(1))
        );
    }

    #[test]
    fn usable_as_dyn_error_ref() {
        // &dyn std::error::Error として扱え、Display 経由で文字列化できる。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof);
        let dyn_err: &dyn std::error::Error = &err;
        assert!(!dyn_err.to_string().is_empty());
    }

    #[test]
    fn usable_as_boxed_dyn_error() {
        // Box<dyn std::error::Error> へアップキャストでき to_string() が Display と一致する。
        let err = PdfError::new(PdfErrorCode::UnexpectedEof).with_position(ByteOffset::new(12));
        let expected = err.to_string();
        let boxed: Box<dyn std::error::Error> = Box::new(err);
        assert_eq!(boxed.to_string(), expected);
    }

    #[test]
    fn source_is_none() {
        // 下位エラー連鎖は当面ないため source() は None を返す。
        use std::error::Error;
        let err = PdfError::new(PdfErrorCode::UnexpectedEof);
        assert!(err.source().is_none());
    }

    #[test]
    fn propagates_via_question_mark_into_boxed_error() {
        // Result<(), Box<dyn Error>> の中で ? 演算子により PdfError が自動変換されて伝播する。
        fn do_parse() -> Result<(), Box<dyn std::error::Error>> {
            Err(PdfError::new(PdfErrorCode::UnexpectedEof).with_position(ByteOffset::new(3)))?;
            Ok(())
        }
        let result = do_parse();
        assert!(result.is_err());
        let boxed = result.unwrap_err();
        // 元の PdfError と同じ Display 文字列であることで中身が保たれていることを確認する
        assert_eq!(
            boxed.to_string(),
            PdfError::new(PdfErrorCode::UnexpectedEof)
                .with_position(ByteOffset::new(3))
                .to_string()
        );
    }
}
