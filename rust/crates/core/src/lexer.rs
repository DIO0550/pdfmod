//! PDF 字句解析（lexer）を構成するモジュール。
//!
//! ISO 32000 のレキシカル規約（`docs/specs/01_lexical_conventions.md`）に基づき、
//! バイト 3 分類（whitespace / delimiter / regular）を表す `ByteKind` と述語関数、
//! および改行（LF / CR / CRLF）を等価に 1 改行として扱う判定関数を提供する。
//! 字句種別を表す `Token` enum およびトークナイザ等の上位機能は本モジュール配下に追加する。
//!
//! 本ファイルはサブモジュールの mod 宣言と再 export のみを持つファサードであり、
//! `Lexer` 構造体本体と基本 API は `core` サブモジュールが提供する。

// 既存モジュール（別ファイル分離済み）
pub mod byte_kind;
pub(crate) mod byte_ops;
mod core;
pub mod eol;
mod hex_string;
mod literal_string;
pub mod token;

// 責務ごとに分割したサブモジュール
mod cursor;
mod delimiters;
mod dispatch;
mod integer;
mod keyword;
mod lookahead;
mod name;
mod real;
pub(crate) mod skip;

// extern prelude の `core`（libcore）との曖昧性（E0659）を避けるため self 修飾で再 export する
pub use self::core::Lexer;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod peek_token_tests;
