//! PDF 処理のエラー型を定義するモジュール。
//!
//! エラーの種類を表す分類タグ `PdfErrorCode` と、種別に発生位置・補足メッセージ等の
//! 詳細情報を添えた文脈付きエラー値 `PdfError` を提供する。

pub mod pdf_error;
pub mod pdf_error_code;
