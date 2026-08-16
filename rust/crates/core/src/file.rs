//! PDF の物理ファイル構造（ヘッダ・xref・トレイラ）を扱うモジュール。
//!
//! ISO 32000-1:2008 §7.5（`docs/specs/02_file_structure.md`）に対応する。
//! 本ファイルはサブモジュールの mod 宣言のみを持つファサード。
//! ヘッダ解析（`header`）・バージョン（`version`）・
//! xref 開始オフセットの取得（`startxref`）を提供する。
//! xref テーブルとトレイラの解析は [`crate::xref`] モジュールが担う
//! （[`crate::xref::table::parse`] / [`crate::xref::trailer::parse`]）。

pub mod header;
pub mod startxref;
pub mod version;
