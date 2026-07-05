//! PDF 字句解析（lexer）を構成するモジュール。
//!
//! ISO 32000 のレキシカル規約（`docs/specs/01_lexical_conventions.md`）に基づき、
//! バイト 3 分類（whitespace / delimiter / regular）を表す `ByteKind` と述語関数、
//! および改行（LF / CR / CRLF）を等価に 1 改行として扱う判定関数を提供する。
//! 字句種別を表す `Token` enum およびトークナイザ等の上位機能は本モジュール配下に追加する。
//!
//! 本モジュール直下では、`&'a [u8]` を借用する `Lexer<'a>` 構造体を提供し、
//! カーソル位置の管理（pos）と先読み（peek / peek_at）・前進（advance）・
//! EOF 判定（is_eof）、および ISO 32000 lexical conventions に基づく
//! ホワイトスペース・コメントのスキップ API、低レベル read API（整数 / 実数 /
//! 名前 / 配列・辞書デリミタ / キーワード等）と、それらをまとめて 1 トークン分の
//! ディスパッチを行う `next_token` API を提供する。
//! 本層は PDF レキシカル層の最下層 API であり、任意の入力・任意の pos に
//! 対して panic しない契約を厳守する（既存 `EolKind::at` と同方針）。

// 既存モジュール（別ファイル分離済み）
pub mod byte_kind;
mod byte_ops;
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
mod skip;

use std::collections::VecDeque;

use token::Token;

// 内部ヘルパ: 16進数字 1 バイト ('0'-'9' / 'a'-'f' / 'A'-'F') を 0-15 に変換する。
// 呼び出し側で is_ascii_hexdigit を確認済みであることを前提とする。
fn hex_value(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => b - b'a' + 10,
        _ => b - b'A' + 10,
    }
}

/// PDF バイト列を走査するカーソル付き Lexer。
///
/// 入力バイト列を所有せず借用のみ保持するため、割り当てゼロで走査できる。
/// `pos` はバイト先頭からのオフセット（`usize`）であり、`0 ≦ pos ≦ input.len()` を
/// 不変条件として維持する。
///
/// 本構造体はあらゆる API について panic しない契約を持つ。範囲外アクセスは
/// `slice::get` の `Option` で吸収し、`usize` の加算は `checked_add` で扱う。
#[derive(Debug)]
pub struct Lexer<'a> {
    input: &'a [u8],
    pos: usize,
    buffer: VecDeque<(Token, usize)>,
}

impl<'a> Lexer<'a> {
    /// 入力バイト列を借用して新しい `Lexer` を生成する。`pos` は 0 で初期化される。
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            input,
            pos: 0,
            buffer: VecDeque::new(),
        }
    }

    /// 論理カーソル位置を返す。バッファに peek 済みトークンがあればその先頭エントリの開始位置を、
    /// バッファ空時は現在のカーソル位置 (`self.pos`) を返す。
    ///
    /// バッファ非空時のみ「次に `take_token` で取り出されるトークンの開始バイト位置」と等価。
    /// バッファ空時の `self.pos` は直前のトークン末尾直後を指すため、次のトークン開始位置とは
    /// 一致しないことがある（`take_token` 内部の `skip_whitespace` で whitespace を消費した
    /// 後の位置）。次に取り出されるトークンの開始位置が必要な場合は
    /// [`Self::peek_token_with_pos`] の返す `pos` を使う。
    /// バッファを無視した生のカーソル位置が必要な場合は [`Self::cursor_position`] を使う。
    pub fn position(&self) -> usize {
        self.buffer.front().map(|(_, pos)| *pos).unwrap_or(self.pos)
    }

    /// バイト単位のカーソル位置 (`self.pos`) を直接返す。バッファ内のトークンを無視した生の値。
    ///
    /// 用途: lookahead 中に lexer が malformed を検知した場合のエラー位置報告など、
    /// 論理カーソルではなく生バイト位置が必要な場面で使う。
    /// 通常の論理カーソルが必要な場合は [`Self::position`] を使う。
    pub fn cursor_position(&self) -> usize {
        self.pos
    }

    #[cfg(test)]
    pub(crate) fn buffer_capacity_for_tests(&self) -> usize {
        self.buffer.capacity()
    }

    /// `pos` が入力末尾に達しているか（EOF）。
    ///
    /// 不変条件 `0 ≦ pos ≦ input.len()` の下では `pos == input.len()` と等価だが、
    /// 不変条件の破れを検知不能にしないため実装は `>=` で防衛的に判定する。
    pub fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod peek_token_tests;
