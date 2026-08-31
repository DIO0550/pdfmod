//! PDF 16 進文字列 `< ... >` (ISO 32000-1 §7.3.4.3 / docs/specs/01_lexical_conventions.md §3.5)
//! の字句解析を提供する。
//!
//! 公開 API は `Lexer::read_hex_string` のみ（`decode_hex_string` への薄いラッパー）。
//! `decode_hex_string` は走査本体（デリミタ判定・whitespace スキップ・ニブルのペア合成・
//! 奇数桁の 0 補完）を担う純関数で、入力バッファと位置だけ受け取り
//! (デコード済みバイト列, 閉じ `>` 直後の次位置) を返す（Lexer の状態に依存しない）。
//! ニブル合成（上位 4bit + 下位 4bit → 1 バイト）は汎用ユーティリティとして
//! `super::byte_ops::combine_pair` に切り出しており、本モジュールはトークン化の責務に集中する。

use super::byte_kind::ByteKind;
use super::byte_ops::{combine_pair, hex_value};
use super::Lexer;

/// PDF 16 進文字列 `< ... >` (ISO 32000-1 §7.3.4.3) を `input` の `pos` 位置から
/// デコードする純関数。境界チェックは `slice::get` で行い、いかなる入力・いかなる `pos` でも
/// panic しない。本関数は `input` を借用するだけで、位置の反映は呼び出し側が行う。
///
/// # 受理する字句
/// - 空文字列 `<>` → `Some((vec![], pos + 2))`
/// - 偶数桁 `<48656C6C6F>` → `Some((b"Hello".to_vec(), ...))`
/// - 奇数桁 `<F>` → `Some((vec![0xF0], ...))` (末尾に `0` を補完)
/// - 内部 whitespace 6 種 (NUL/TAB/LF/FF/CR/SP) は無視
/// - 大文字小文字 (`0-9` / `A-F` / `a-f`) を等価に扱う
///
/// # 戻り値の特性
/// - デコード結果の `Vec<u8>` は任意値 (0x80〜0xFF / 非 UTF-8 シーケンス含む) を保持する。
///   lexer は UTF-8 を仮定せず、合成したバイトをそのまま積むため、高位バイトや非 UTF-8
///   シーケンスも変質なく忠実に保持される。入力側で受理されるのはあくまで ASCII 16 進
///   数字 (`0-9` / `A-F` / `a-f`) と PDF §7.2.2 whitespace 6 種のみ。
///
/// # 拒否する字句 (None)
/// - 空入力 / `pos` が範囲外 / `input[pos]` が `<` でない
/// - 不正な 16 進数字 (`X` 等) を観測
/// - 閉じ `>` が出現せず EOF (未終端)
/// - `pos.checked_add` が overflow
///
/// # 戻り値
/// - `Some((bytes, next))`: `bytes` はデコード済みバイト列、`next` は閉じ `>` **直後の次位置**
///   （入力先頭起点の絶対オフセット。`decode_literal_string` と同一の規約）。
/// - `None`: 失敗。本関数は状態を持たないため、呼び出し側が位置を進めなければ
///   「失敗時 pos 不変（完全巻き戻し）」の契約が自然に成立する。
pub(super) fn decode_hex_string(input: &[u8], pos: usize) -> Option<(Vec<u8>, usize)> {
    if input.get(pos) != Some(&b'<') {
        return None;
    }
    let mut pos = pos.checked_add(1)?;

    let mut bytes: Vec<u8> = Vec::new();
    // high: 直前に読んだ上位 4bit (まだペアの相方を待っている状態)。
    // None なら次の hex 数字は high、Some(h) なら次の hex 数字は low として h と合成する。
    let mut high: Option<u8> = None;

    // 状態分岐（終端 / whitespace / hex digit / 不正バイト）が多く、
    // while-let よりも明示的な loop + 分岐の方が読みやすいため
    #[allow(clippy::while_let_loop)]
    loop {
        let Some(&b) = input.get(pos) else {
            // EOF (未終端) — 純関数はローカル状態を捨てて None を返すだけ（巻き戻し不要）
            return None;
        };

        // 終端 '>' — 奇数桁なら末尾 0 補完してから閉じ '>' の直後を返す
        if b == b'>' {
            if let Some(h) = high {
                bytes.push(combine_pair(h, 0));
            }
            let next = pos.checked_add(1)?;
            return Some((bytes, next));
        }

        // whitespace スキップ (PDF §7.2.2 の NUL/TAB/LF/FF/CR/SP 6 バイトに対応)
        if ByteKind::is_whitespace(b) {
            pos = pos.checked_add(1)?;
            continue;
        }

        // 16 進数字 — high/low の状態でペア合成
        if let Some(nibble) = hex_value(b) {
            match high {
                None => high = Some(nibble),
                Some(h) => {
                    bytes.push(combine_pair(h, nibble));
                    high = None;
                }
            }
            pos = pos.checked_add(1)?;
            continue;
        }

        // それ以外（不正バイト）— ローカル状態を捨てて None
        return None;
    }
}

impl<'a> Lexer<'a> {
    /// PDF 16 進文字列 `< ... >` (ISO 32000-1 §7.3.4.3) をデコード後のバイト列として読み取る。
    /// 計算は純関数 [`decode_hex_string`] に委譲し、本メソッドは結果の反映
    /// （`pos` 前進）のみを行う薄いラッパー。受理・拒否する字句の詳細は純関数側の doc を参照。
    ///
    /// # 契約
    /// - 成功時 `Some(Vec<u8>)`: `pos` は閉じ `>` の直後
    /// - 失敗時 `None`: `pos` は呼び出し前と等しい (完全巻き戻し)。
    ///   `decode_hex_string` が失敗した場合は `?` で早期 return するため `self.pos` に触れない。
    /// - 任意の入力・任意の `pos` で panic しない
    pub fn read_hex_string(&mut self) -> Option<Vec<u8>> {
        let (bytes, next) = decode_hex_string(self.input, self.pos)?;
        self.pos = next;
        Some(bytes)
    }
}

#[cfg(test)]
mod tests;
