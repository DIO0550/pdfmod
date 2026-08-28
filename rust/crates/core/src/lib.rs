//! # pdfmod-core
//!
//! PDF 処理エンジン（pdfmod の Rust 実装）。
//! ISO 32000-1:2008 (PDF 1.7) および ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。
//!
//! ## 設計方針
//!
//! - **外部 crate 依存ゼロ**。Rust 標準ライブラリ (`std`) のみを使う。
//! - **`Result` / `Option` は std のものをそのまま使う**（汎用のクローンを自作しない）。
//!   ドメイン固有の状態を型で表す判別可能 enum（`XRefEntry` / `LexOutcome` など）は推奨する。
//!   エラーに「実際に来た型」を載せる用途も、文字列ラベルではなくデータを持たない判別 enum
//!   （`ObjectKind` / `TokenKind`）で表す。網羅 match が書け、実在しないラベルを混入させられない。
//!
//! byte_offset / encrypt / error / file / filter / lexer / object / parser / xref の各モジュールは実装済み。
//! `encrypt` は暗号化辞書（`/Encrypt`）の型表現を提供する（復号処理は未実装）。
//! `file` はヘッダ解析と startxref の末尾スキャンを提供する。
//! `filter` は `/FlateDecode`（zlib / DEFLATE）の展開を提供する。
//! 他のフィルタと `/DecodeParms` の Predictor 適用は後続 PR で追加する。
//! `xref` は xref エントリとテーブルの表現に加え、従来型 xref テーブルの解析と
//! 従来形式トレイラの解析を提供する。
//! xref ストリームの解析と `/Prev` チェーン走査は後続 PR で追加する。

pub mod byte_offset;
pub mod encrypt;
pub mod error;
pub mod file;
pub mod filter;
pub mod lexer;
pub mod object;
pub mod parser;
pub mod xref;
