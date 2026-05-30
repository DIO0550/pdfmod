//! # pdfmod-core
//!
//! PDF 処理エンジン（pdfmod の Rust 実装）。
//! ISO 32000-1:2008 (PDF 1.7) および ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。
//!
//! ## 設計方針
//!
//! - **外部 crate 依存ゼロ**。Rust 標準ライブラリ (`std`) のみを使う。
//! - **`Result` / `Option` は std のものをそのまま使う**。
//!   TypeScript 版 (`packages/core`) には自作の `Result`/`Option` ユーティリティが
//!   あるが、Rust ではこれらは言語標準型なので再実装しない（意図的な省略）。
//! - TS 版の Brand 型 + companion object パターンは、Rust の newtype + 関連関数
//!   (`of()` / `create()` / `value()`) に移植する。
//! - TS 版の discriminated union（`PdfObject`, `XRefEntry`, `PdfErrorCode`）は
//!   Rust の `enum` に移植する。
//!
//! ## モジュール構成（TS 版 `packages/core/src` に対応）
//!
//! - [`pdf`]            — PDF 基本型・エラー・オブジェクトモデル・バージョン・フィルタ
//! - [`lexer`]          — 字句解析（バイト処理・トークナイザ）
//! - [`ext`]            — 数値・文字列の拡張ユーティリティ
//! - [`objects`]        — オブジェクトのパース・ストア・ストリーム抽出
//! - [`xref`]           — 相互参照テーブル / ストリーム / トレーラ
//! - [`document`]       — ドキュメント・カタログ・ページツリー・メタデータ
//! - [`content_stream`] — コンテンツストリームの解釈・オペレータ

pub mod content_stream;
pub mod document;
pub mod ext;
pub mod lexer;
pub mod objects;
pub mod pdf;
pub mod xref;
