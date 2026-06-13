//! PDF 字句解析（lexer）を構成するモジュール。
//!
//! ISO 32000 のレキシカル規約（`docs/specs/01_lexical_conventions.md`）に基づき、
//! バイト 3 分類（whitespace / delimiter / regular）を表す `ByteKind` と述語関数、
//! および改行（LF / CR / CRLF）を等価に 1 改行として扱う判定関数を提供する。
//! トークナイザ等の上位機能は後続 Issue で本モジュール配下に追加する。

pub mod byte_kind;
pub mod eol;
