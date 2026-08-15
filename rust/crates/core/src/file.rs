//! PDF の物理ファイル構造（ヘッダ・xref・トレイラ）を扱うモジュール。
//!
//! ISO 32000-1:2008 §7.5（`docs/specs/02_file_structure.md`）に対応する。
//! 本ファイルはサブモジュールの mod 宣言のみを持つファサード。
//! 現時点ではヘッダ解析（`header`）・バージョン（`version`）・
//! xref 開始オフセットの取得（`startxref`）を提供し、
//! xref テーブル / トレイラは後続の Issue で追加する。

pub mod header;
pub mod startxref;
pub mod version;
