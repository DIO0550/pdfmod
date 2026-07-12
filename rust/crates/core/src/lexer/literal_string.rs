//! PDF リテラル文字列 `( ... )` (ISO 32000-1 §7.3.4.2 / docs/specs/01_lexical_conventions.md §3.4)
//! の字句解析を提供する。
//!
//! 公開 API は `Lexer::read_literal_string` のみ。
//! `decode_escape` / `decode_octal` はモジュール内部の純関数で、入力バッファと位置だけ受け取り
//! `(push バイト, 消費バイト数)` を返す（Lexer の状態に依存しない単体テスト可能な計算ロジック）。

use super::eol::EolKind;
use super::Lexer;

// 8 進エスケープ `\ddd` の仕様定数（ISO 32000-1 §7.3.4.2）。
const MAX_OCTAL_DIGITS: usize = 3; // greedy 最大桁数
const OCTAL_RADIX: u16 = 8; // 8 進基数
const BYTE_MASK: u16 = 0xFF; // 下位 8 ビット採用マスク（`\777` = 511 のクランプ用）
const ESCAPE_PREFIX_BYTES: usize = 1; // `consumed` に含む `\` の 1 バイト

/// `\\` 起点のエスケープシーケンスをデコードする純関数。
/// `input[pos] == b'\\'` を想定。
///
/// # 戻り値
/// - `Some((Some(byte), consumed))`: `bytes` に `byte` を push し、`pos` を `consumed` バイト前進
/// - `Some((None, consumed))`: 何も push せず、`pos` を `consumed` バイト前進（行継続 / `\\` 直後 EOF）
/// - `None`: `pos.checked_add` overflow など（呼び出し側で巻き戻し）
///
/// `consumed` は `\\` を含む（簡易 8 種 = 2、行継続 = 1 + eol.byte_len()、`\\` 直後 EOF = 1、8 進 = 1 + digits）。
pub(super) fn decode_escape(input: &[u8], pos: usize) -> Option<(Option<u8>, usize)> {
    let next_pos = pos.checked_add(1)?;

    // 行継続 `\\ + EOL` — 出力なし、EOL 込みで前進
    // (peek_at(1) 判定より EolKind::at を先に評価する: CRLF を 1 個の EOL として扱うため)
    if let Some(eol) = EolKind::at(input, next_pos) {
        let consumed = 1usize.checked_add(eol.byte_len())?;
        return Some((None, consumed));
    }

    match input.get(next_pos) {
        // 簡易エスケープ 8 種 — 2 バイト消費、decoded を Some(byte) で返却
        Some(b'n') => Some((Some(0x0A), 2)),
        Some(b'r') => Some((Some(0x0D), 2)),
        Some(b't') => Some((Some(0x09), 2)),
        Some(b'b') => Some((Some(0x08), 2)),
        Some(b'f') => Some((Some(0x0C), 2)),
        Some(b'(') => Some((Some(b'('), 2)),
        Some(b')') => Some((Some(b')'), 2)),
        Some(b'\\') => Some((Some(b'\\'), 2)),

        // 8 進エスケープ \\ddd — greedy 1〜3 桁、(acc & 0xFF) as u8 を返却
        Some(&d) if (b'0'..=b'7').contains(&d) => decode_octal(input, next_pos),

        // \\ 直後 EOF — \\ だけ消費、出力なし。Lexer 側で pos 前進後、次反復で本体が EOF 検出して巻き戻す
        None => Some((None, 1)),

        // 未知エスケープ — バックスラッシュ捨て、次バイトを 1 文字として保持 (ISO 32000-1 §7.3.4.2)
        Some(&other) => Some((Some(other), 2)),
    }
}

/// 8 進エスケープ `\\ddd` の数字部分をデコードする内部ヘルパ（純関数）。
///
/// # 契約
/// - 呼び出し側は `digits_start ≦ input.len()` を保証する
///   （現状の唯一の呼び出し元 `decode_escape` は `next_pos = pos.checked_add(1)?` と
///   `input.get(next_pos).is_some()` を通過した位置のみ渡す）。
/// - 内部の加算 `digits_start + digits` / `ESCAPE_PREFIX_BYTES + digits` は
///   ループ不変条件 `digits < MAX_OCTAL_DIGITS` および上記契約により overflow しない。
/// - もし呼び出し側契約が破られて overflow に近い値が渡っても、
///   最終的な検出は上位 `Lexer::read_literal_string` の
///   `self.pos.checked_add(consumed)?` に一任される（巻き戻し保証）。
///
/// # 戻り値
/// - `consumed` は `\\` の 1 バイトを含む（`ESCAPE_PREFIX_BYTES + digits`、最大 4）。
/// - 累積 `acc` は `u16` で最大 `\\777 = 511`、`(acc & BYTE_MASK) as u8` で下位 8 ビット採用。
/// - 外側 `Option<...>`: 本経路で `None` を返す分岐は存在しない
///   （`input.get` が `None` の場合は `break` して
///   `Some((Some((acc & BYTE_MASK) as u8), ESCAPE_PREFIX_BYTES + digits))` を返す）。
///   将来の EOL 分岐追加や別呼び出し元追加を想定した拡張余地として型上のみ保持している。
fn decode_octal(input: &[u8], digits_start: usize) -> Option<(Option<u8>, usize)> {
    // acc は u16 で累積（最大値 \\777 = 511 < u16::MAX）。最後に BYTE_MASK で下位 8 ビット採用。
    let mut acc: u16 = 0;
    let mut digits: usize = 0;
    while digits < MAX_OCTAL_DIGITS {
        let pos = digits_start + digits; // 契約により overflow 到達不能
        let Some(&b) = input.get(pos) else { break };
        if !(b'0'..=b'7').contains(&b) {
            break;
        }
        acc = acc * OCTAL_RADIX + (b - b'0') as u16;
        digits += 1;
    }
    let consumed = ESCAPE_PREFIX_BYTES + digits; // digits ≦ MAX_OCTAL_DIGITS により最大 4
    Some((Some((acc & BYTE_MASK) as u8), consumed))
}

impl<'a> Lexer<'a> {
    /// PDF リテラル文字列 `( ... )` (ISO 32000-1 §7.3.4.2) をデコード後のバイト列として読み取る。
    ///
    /// # 受理する字句
    /// - 空文字列 `()` → `Some(b"".to_vec())`
    /// - バランスしたネスト `(a(b)c)` → 内側の `(` / `)` はバイトとして含める
    /// - エスケープ 8 種 (`\n`/`\r`/`\t`/`\b`/`\f`/`\(`/`\)`/`\\`)
    /// - 8 進エスケープ `\ddd` (greedy 最大 3 桁、`'0'..='7'`、0xFF 超は下位 8 ビット採用)
    /// - 裸 EOL (LF/CR/CRLF) の LF 正規化
    /// - 行末 `\` + EOL の行継続 (出力に何も追加しない)
    /// - 未知エスケープ (`\x` 等) はバックスラッシュのみ捨てて次バイトを保持
    /// - 任意のバイト (NUL/非UTF-8/高位) を無検証で忠実に保持
    ///
    /// # 拒否する字句 (None 巻き戻し)
    /// - 空入力 / EOF / 先頭が `(` でない → `pos` 不変で即 `None`
    /// - EOF までに対応する閉じ `)` が出ない (未終端) → `pos` を呼び出し前位置に完全巻き戻し
    /// - `pos.checked_add` / `depth.checked_add` が overflow → 同様に巻き戻し
    /// - 内部不変条件破れ (depth ≤ 0 の状態で `)` を観測) → 同様に巻き戻し
    ///
    /// # 契約
    /// - 成功時 `Some(Vec<u8>)`: `pos` は閉じ `)` の直後
    /// - 失敗時 `None`: `pos` は呼び出し前と等しい (完全巻き戻し)
    /// - 任意の入力・任意の `pos` で panic しない
    pub fn read_literal_string(&mut self) -> Option<Vec<u8>> {
        let start = self.pos;

        if self.peek() != Some(b'(') {
            return None;
        }
        let Some(after_open) = self.pos.checked_add(1) else {
            self.pos = start;
            return None;
        };
        self.pos = after_open;

        let mut bytes: Vec<u8> = Vec::new();
        // depth: 文字列内のネスト深度。'(' で +1、')' で -1、終了時 0（不変条件: ループ内で depth >= 1）。
        // '(' 側で depth.checked_add を使うのは i32::MAX overflow の panic 防御
        // （実用上 21 億ネスト = 入力 2GB+ で到達しないが、untrusted / fuzz 入力契約のため使用）。
        let mut depth: i32 = 1;

        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else {
                // EOF (未終端) — 巻き戻し
                self.pos = start;
                return None;
            };

            match b {
                // 開き括弧 '(' — depth +1、'(' を bytes に push
                // depth.checked_add は論理的不変条件の overflow 防御、pos.checked_add は usize overflow 防御
                b'(' => {
                    let Some(next_depth) = depth.checked_add(1) else {
                        self.pos = start;
                        return None;
                    };
                    let Some(next) = self.pos.checked_add(1) else {
                        self.pos = start;
                        return None;
                    };
                    bytes.push(b'(');
                    depth = next_depth;
                    self.pos = next;
                }

                // 閉じ括弧 ')' — depth -1、depth == 0 なら終了、それ以外で push
                // 不変条件 depth >= 1 を明示ガードで守る（破れていれば巻き戻して None）。
                // 通過後は depth - 1 が underflow しないので checked_sub は不要。
                b')' => {
                    if depth <= 0 {
                        self.pos = start;
                        return None;
                    }
                    let Some(next) = self.pos.checked_add(1) else {
                        self.pos = start;
                        return None;
                    };
                    depth -= 1;
                    self.pos = next;
                    if depth == 0 {
                        return Some(bytes);
                    }
                    bytes.push(b')');
                }

                // バックスラッシュ '\\' — 純関数 decode_escape に「計算」を委譲し、
                // Lexer 側はその結果を「反映」（pos 更新 + bytes.push）するだけ
                b'\\' => {
                    let Some((push_byte, consumed)) = decode_escape(self.input, self.pos) else {
                        self.pos = start;
                        return None;
                    };
                    let Some(next) = self.pos.checked_add(consumed) else {
                        self.pos = start;
                        return None;
                    };
                    self.pos = next;
                    if let Some(d) = push_byte {
                        bytes.push(d);
                    }
                }

                // 裸 EOL の LF 正規化（CR/CRLF → LF, LF → LF）/ その他バイトはそのまま保持
                _ => match EolKind::at(self.input, self.pos) {
                    Some(eol) => {
                        let Some(next) = self.pos.checked_add(eol.byte_len()) else {
                            self.pos = start;
                            return None;
                        };
                        bytes.push(0x0A);
                        self.pos = next;
                    }
                    None => {
                        let Some(next) = self.pos.checked_add(1) else {
                            self.pos = start;
                            return None;
                        };
                        bytes.push(b);
                        self.pos = next;
                    }
                },
            }
        }
    }
}

#[cfg(test)]
mod tests;
