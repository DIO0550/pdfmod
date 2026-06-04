//! PDF 処理のエラー型を定義するモジュール。
//!
//! エラーの種類を表す分類タグ `PdfErrorCode` を提供する。位置・メッセージ等の
//! 詳細情報を保持する `PdfError` など他のエラー型は後続 Issue で追加する。

pub mod pdf_error_code;

// 後続 Issue でエラー型のサブモジュールを追加する:
// pub mod pdf_error;
