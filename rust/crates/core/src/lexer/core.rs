//! `Lexer` 構造体本体と基本 API。
//!
//! `&'a [u8]` を借用する `Lexer<'a>` 構造体を提供し、カーソル位置の管理（pos）と
//! EOF 判定（is_eof）を担う。
//! 先読み（peek / peek_at）・前進（advance）、および
//! ISO 32000 lexical conventions に基づくホワイトスペース・コメントのスキップ API、
//! 低レベル read API（整数 / 実数 / 名前 / 配列・辞書デリミタ / キーワード等）と、
//! それらをまとめて 1 トークン分のディスパッチを行う `next_token` API は
//! 兄弟モジュール（cursor / skip / dispatch 等）の impl 分割で提供される。
//! 本層は PDF レキシカル層の最下層 API であり、任意の入力・任意の pos に
//! 対して panic しない契約を厳守する（既存 `EolKind::at` と同方針）。

use std::collections::VecDeque;

use super::token::Token;

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
    pub(in crate::lexer) input: &'a [u8],
    pub(in crate::lexer) pos: usize,
    pub(in crate::lexer) buffer: VecDeque<(Token, usize)>,
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
