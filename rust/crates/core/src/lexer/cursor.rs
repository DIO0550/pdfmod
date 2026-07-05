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
}
