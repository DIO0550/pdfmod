//! PDF の相互参照（cross-reference）表現を扱うモジュール。
//!
//! ISO 32000-1:2008 §7.5.4（相互参照テーブル）/ §7.5.8（相互参照ストリーム）、
//! `docs/specs/02_file_structure.md` §4 / `docs/specs/02a_object_resolution.md` §2
//! に対応する。
//! 本ファイルはサブモジュールの mod 宣言のみを持つファサード。
//! 現時点では xref エントリの表現（`entry`）とテーブルの表現（`table`）を提供し、
//! 従来型 xref テーブルの解析（#584）・xref ストリームの解析（#588）・トレイラは
//! 後続の Issue で追加する。

pub mod entry;
pub mod table;
