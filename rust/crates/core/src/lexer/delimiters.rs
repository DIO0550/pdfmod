//! PDF 配列 `[ ]` / 辞書 `<< >>` のデリミタ字句解析 (ISO 32000-1 §7.3.6 / §7.3.7)。

use super::token::Token;
use super::Lexer;

impl<'a> Lexer<'a> {
    /// 配列開始デリミタ `[`（ISO 32000-1 §7.3.6）を 1 バイト消費して `Token::ArrayBegin` を返す。
    ///
    /// 受理する字句:
    /// - `[`（0x5B）1 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `[` 以外のすべて（whitespace / 別 delimiter / regular / EOF）
    ///
    /// 巻き戻し: 先頭バイトが `[` でない場合 `pos` を一切動かさず `None` を返すため、
    /// 明示的な巻き戻し処理は不要。
    ///
    /// panic 不在: `peek()` の `Option` と `checked_add(1)` で範囲外を吸収する。
    /// 不変条件 `0 ≦ pos ≦ input.len()` のもとでは `checked_add(1)` の `None` 分岐は
    /// `pos == usize::MAX` のときだけ理論上発生するが、その場合は直前の `peek()` が
    /// `None` を返して早期 return しているため到達不能。契約を機械的に守るため `?` で明示する。
    pub fn read_array_begin(&mut self) -> Option<Token> {
        if self.peek() != Some(b'[') {
            return None;
        }
        self.pos = self.pos.checked_add(1)?;
        Some(Token::ArrayBegin)
    }

    /// 配列終了デリミタ `]`（ISO 32000-1 §7.3.6）を 1 バイト消費して `Token::ArrayEnd` を返す。
    ///
    /// 受理する字句:
    /// - `]`（0x5D）1 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `]` 以外のすべて（whitespace / 別 delimiter / regular / EOF）
    ///
    /// 巻き戻し / panic 不在: `read_array_begin` と同方針。
    pub fn read_array_end(&mut self) -> Option<Token> {
        if self.peek() != Some(b']') {
            return None;
        }
        self.pos = self.pos.checked_add(1)?;
        Some(Token::ArrayEnd)
    }

    /// 辞書開始デリミタ `<<`（ISO 32000-1 §7.3.7）を 2 バイト消費して `Token::DictBegin` を返す。
    ///
    /// 受理する字句:
    /// - `<<`（0x3C 0x3C）2 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `<` 以外（whitespace / 別 delimiter / regular / EOF）
    /// - 先頭が `<` でも 2 バイト目が `<` でない場合（例: `<a`（16 進開始）、`<>`（空 16 進文字列）、`< `、`<` 単独）
    ///
    /// 上記の `<` 単独や `<` + 非 `<` のケースは `read_hex_string` の責務範囲（16 進文字列 / 空 16 進文字列）に
    /// 該当しうるため、本関数は `pos` を一切動かさずに `None` を返すことで `read_hex_string` への
    /// フォールバックを可能にする。
    ///
    /// 巻き戻し: `peek_at(1)` で 2 バイト目を先読みするため、判定で `None` を返すときに `pos` を
    /// 動かす必要はない（先頭バイトを消費しない）。
    ///
    /// panic 不在: `peek()` / `peek_at(1)` は内部で `checked_add` を使い、`checked_add(2)` で
    /// 範囲外を吸収する。
    pub fn read_dict_begin(&mut self) -> Option<Token> {
        if self.peek() != Some(b'<') {
            return None;
        }
        if self.peek_at(1) != Some(b'<') {
            return None;
        }
        self.pos = self.pos.checked_add(2)?;
        Some(Token::DictBegin)
    }

    /// 辞書終了デリミタ `>>`（ISO 32000-1 §7.3.7）を 2 バイト消費して `Token::DictEnd` を返す。
    ///
    /// 受理する字句:
    /// - `>>`（0x3E 0x3E）2 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `>` 以外
    /// - 先頭が `>` でも 2 バイト目が `>` でない場合（`>` 単独 / `>x` / `> ` / `>` + EOF）
    ///
    /// 巻き戻し / panic 不在: `read_dict_begin` と同方針。
    pub fn read_dict_end(&mut self) -> Option<Token> {
        if self.peek() != Some(b'>') {
            return None;
        }
        if self.peek_at(1) != Some(b'>') {
            return None;
        }
        self.pos = self.pos.checked_add(2)?;
        Some(Token::DictEnd)
    }
}
