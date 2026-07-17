//! # pdfmod-core
//!
//! PDF 処理エンジン（pdfmod の Rust 実装）。
//! ISO 32000-1:2008 (PDF 1.7) および ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。
//!
//! ## 設計方針
//!
//! - **外部 crate 依存ゼロ**。Rust 標準ライブラリ (`std`) のみを使う。
//! - **`Result` / `Option` は std のものをそのまま使う**（自作しない）。
//!
//! byte_offset / error / lexer / object / parser の各モジュールは実装済み。
//! xref / trailer など、PDF ファイル構造を扱う後続モジュールは今後の PR で追加する。

pub mod byte_offset;
pub mod error;
pub mod lexer;
pub mod object;
pub mod parser;
