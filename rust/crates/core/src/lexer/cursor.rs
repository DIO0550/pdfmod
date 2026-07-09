//! Lexer の生カーソル操作（1 バイト単位の peek / advance）。
//!
//! `input: &'a [u8]` と `pos: usize` に対する低レベル API。
//! panic 不在契約（`slice::get` の Option / `checked_add` で範囲外を吸収）。

use super::Lexer;

impl<'a> Lexer<'a> {
    /// 現在位置のバイトを覗き見る（消費しない）。EOF なら `None`。
    pub fn peek(&self) -> Option<u8> {
        self.input.get(self.pos).copied()
    }

    /// 現在位置から `offset` バイト先のバイトを覗き見る（消費しない）。
    ///
    /// `pos + offset` が `usize` をオーバーフローする場合、または範囲外の場合は `None`。
    pub fn peek_at(&self, offset: usize) -> Option<u8> {
        self.pos
            .checked_add(offset)
            .and_then(|p| self.input.get(p).copied())
    }

    /// 現在位置のバイトを返して 1 バイト前進する。EOF なら `None`（`pos` は不変）。
    ///
    /// `pos` の前進は `checked_add` 経由で扱う（panic 不在契約。`pos = usize::MAX` で
    /// あれば `peek()` が `None` を返す経路に入るため理論上到達しないが、契約を
    /// 機械的に守るために `?` で明示する）。
    pub fn advance(&mut self) -> Option<u8> {
        let byte = self.peek()?;
        self.pos = self.pos.checked_add(1)?;
        Some(byte)
    }

    /// 現在位置から `len` バイトを raw slice として取り出し、`pos` を `pos + len` に進める。
    ///
    /// ストリームデータのように「Length バイトを丸ごと切り出す」用途で使う低レベル API。
    ///
    /// # 契約
    /// - 呼び出し前に `peek_token` / `peek_token_at` などの lookahead を経由していないこと。
    ///   lookahead により内部バッファにトークンが保留されていると、`pos` はバイト
    ///   ストリーム上の「次の生バイト位置」と食い違い、切り出す範囲が壊れる。
    /// - 呼び出し側でバッファをフラッシュ（`take_token` 等で消費）してから呼ぶ責務を持つ。
    ///
    /// # 戻り値
    /// - `Some(slice)` — `input[pos..pos+len]` を返し、内部 `pos` を `pos + len` に進める
    /// - `None` — `pos + len` が入力範囲を超える場合（`checked_add` オーバーフロー含む）。`pos` は不変
    ///
    /// # panic
    /// panic しない契約（`checked_add` / `slice::get` の `Option` 経由でオーバーフロー吸収）。
    pub(crate) fn take_bytes(&mut self, len: usize) -> Option<&'a [u8]> {
        let end = self.pos.checked_add(len)?;
        let slice = self.input.get(self.pos..end)?;
        self.pos = end;
        Some(slice)
    }

    /// 入力バイト列全体への参照を返す（`EolKind::at(input, pos)` に渡す用途）。
    ///
    /// # 契約
    /// - 参照を保持したまま `take_token` / `take_bytes` などの内部状態変更 API を呼ばないこと
    ///   （Rust の借用チェックで拒否される想定）。
    /// - 呼び出し前に `peek_token` などで lookahead バッファが埋まっていないこと。
    pub(crate) fn input(&self) -> &'a [u8] {
        self.input
    }

    /// 現在の `pos` を `n` バイト進める（生バイトを消費するときに使う）。
    ///
    /// 既存の [`Self::advance`] は 1 バイト単位で「消費バイトを返す」API。
    /// 本 API は複数バイトを「戻り値なしで」スキップする用途のため名前を分けている。
    ///
    /// # 契約
    /// - [`Self::take_bytes`] と同様、lookahead バッファが空の状態で呼ぶこと。
    /// - `pos + n` が入力範囲を超える場合は `None` を返し、`pos` は進めない。
    pub(crate) fn skip_bytes(&mut self, n: usize) -> Option<()> {
        let end = self.pos.checked_add(n)?;
        if end > self.input.len() {
            return None;
        }
        self.pos = end;
        Some(())
    }
}
