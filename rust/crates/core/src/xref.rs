//! PDF の相互参照（cross-reference）表現を扱うモジュール。
//!
//! ISO 32000-1:2008 §7.5.4（相互参照テーブル）/ §7.5.8（相互参照ストリーム）、
//! `docs/specs/02_file_structure.md` §4 / `docs/specs/02a_object_resolution.md` §2
//! に対応する。
//! 本ファイルはサブモジュールの mod 宣言のみを持つファサード。
//! xref エントリの表現（`entry`）・テーブルの表現（`table`）・従来型 xref テーブルの
//! 解析（`table::parse`）・従来形式トレイラの解析（`trailer`）・xref 解析専用のエラー型（`error`）を提供する。
//! xref ストリームの解析（#588）・`/Prev` を辿るチェーン走査は
//! 後続の Issue で追加する。

pub mod entry;
pub mod error;
pub mod table;
pub mod trailer;
