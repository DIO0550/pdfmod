//! PDF 16 進文字列 `< ... >` (ISO 32000-1 §7.3.4.3 / docs/specs/01_lexical_conventions.md §3.5)
//! の字句解析を提供する。
//!
//! 公開 API は `Lexer::read_hex_string` のみ。
//! ニブル合成（上位 4bit + 下位 4bit → 1 バイト）は汎用ユーティリティとして
//! `super::byte_ops::combine_pair` に切り出しており、本モジュールはトークン化の責務に集中する。

use super::byte_kind::ByteKind;
use super::byte_ops::combine_pair;
use super::hex_value;
use super::Lexer;

impl<'a> Lexer<'a> {
    /// `pos` を 1 バイト前進する。overflow した場合は `pos` を `rollback_to` に巻き戻し `None`。
    ///
    /// `read_hex_string` 各分岐の panic 不在契約（`usize::MAX` でも安全終了）を集約するためのヘルパ。
    /// 通常呼び出しでは到達不能だが、`?` で早期 return しつつ巻き戻しを 1 行で表現できる。
    fn try_advance_one_or_rollback(&mut self, rollback_to: usize) -> Option<()> {
        let Some(next) = self.pos.checked_add(1) else {
            self.pos = rollback_to;
            return None;
        };
        self.pos = next;
        Some(())
    }

    /// PDF 16 進文字列 `< ... >` (ISO 32000-1 §7.3.4.3) をデコード後のバイト列として読み取る。
    ///
    /// # 受理する字句
    /// - 空文字列 `<>` → `Some(vec![])`
    /// - 偶数桁 `<48656C6C6F>` → `Some(b"Hello".to_vec())`
    /// - 奇数桁 `<F>` → `Some(vec![0xF0])` (末尾に `0` を補完)
    /// - 内部 whitespace 6 種 (NUL/TAB/LF/FF/CR/SP) は無視
    /// - 大文字小文字 (`0-9` / `A-F` / `a-f`) を等価に扱う
    ///
    /// # 戻り値の特性
    /// - デコード結果の `Vec<u8>` は任意値 (0x80〜0xFF / 非 UTF-8 シーケンス含む) を保持する。
    ///   lexer は UTF-8 を仮定せず、合成したバイトをそのまま積むため、高位バイトや非 UTF-8
    ///   シーケンスも変質なく忠実に保持される。入力側で受理されるのはあくまで ASCII 16 進
    ///   数字 (`0-9` / `A-F` / `a-f`) と PDF §7.2.2 whitespace 6 種のみ。
    ///
    /// # 拒否する字句 (None 巻き戻し)
    /// - 空入力 / EOF / 先頭が `<` でない → `pos` 不変で即 `None`
    /// - 不正な 16 進数字 (`X` 等) を観測 → `pos` を呼び出し前位置に完全巻き戻し
    /// - 閉じ `>` が出現せず EOF (未終端) → 同様に巻き戻し
    /// - `pos.checked_add` overflow → 同様に巻き戻し
    ///
    /// # 契約
    /// - 成功時 `Some(Vec<u8>)`: `pos` は閉じ `>` の直後
    /// - 失敗時 `None`: `pos` は呼び出し前と等しい (完全巻き戻し)
    /// - 任意の入力・任意の `pos` で panic しない
    pub fn read_hex_string(&mut self) -> Option<Vec<u8>> {
        let start = self.pos;

        if self.peek() != Some(b'<') {
            return None;
        }
        self.try_advance_one_or_rollback(start)?;

        let mut bytes: Vec<u8> = Vec::new();
        // high: 直前に読んだ上位 4bit (まだペアの相方を待っている状態)。
        // None なら次の hex 数字は high、Some(h) なら次の hex 数字は low として h と合成する。
        let mut high: Option<u8> = None;

        // 状態分岐（終端 / whitespace / hex digit / 不正バイト）が多く、
        // while-let よりも明示的な loop + match の方が読みやすいため
        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else {
                // EOF (未終端) — 巻き戻し
                self.pos = start;
                return None;
            };

            // 終端 '>' — 奇数桁なら末尾 0 補完してから return Some
            if b == b'>' {
                if let Some(h) = high {
                    bytes.push(combine_pair(h, 0));
                }
                self.try_advance_one_or_rollback(start)?;
                return Some(bytes);
            }

            // whitespace スキップ (PDF §7.2.2 の NUL/TAB/LF/FF/CR/SP 6 バイトに対応)
            if ByteKind::is_whitespace(b) {
                self.try_advance_one_or_rollback(start)?;
                continue;
            }

            // 16 進数字 — high/low の状態でペア合成
            if b.is_ascii_hexdigit() {
                let nibble = hex_value(b);
                match high {
                    None => high = Some(nibble),
                    Some(h) => {
                        bytes.push(combine_pair(h, nibble));
                        high = None;
                    }
                }
                self.try_advance_one_or_rollback(start)?;
                continue;
            }

            // それ以外（不正バイト） — 完全巻き戻し
            self.pos = start;
            return None;
        }
    }
}

#[cfg(test)]
mod tests;
