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
//! byte_offset / error / file / lexer / object / parser / xref の各モジュールは実装済み。
//! `file` はヘッダ解析と startxref の末尾スキャンを提供する。
//! `xref` は xref エントリとテーブルの表現に加え、従来型 xref テーブルの解析を提供する。
//! xref ストリームの解析と trailer は後続 PR で追加する。

pub mod byte_offset;
pub mod error;
pub mod file;
pub mod lexer;
pub mod object;
pub mod parser;
pub mod xref;
