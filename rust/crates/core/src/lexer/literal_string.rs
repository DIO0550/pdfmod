//! PDF リテラル文字列 `( ... )` (ISO 32000-1 §7.3.4.2 / docs/specs/01_lexical_conventions.md §3.4)
//! の字句解析を提供する。
//!
//! 公開 API は `Lexer::read_literal_string` のみ。
//! `decode_escape` / `decode_octal` はモジュール内部の純関数で、入力バッファと位置だけ受け取り
//! `(push バイト, 消費バイト数)` を返す（Lexer の状態に依存しない単体テスト可能な計算ロジック）。

use super::{EolKind, Lexer};

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

/// 8 進エスケープ `\\ddd` の数字部分をデコードする内部ヘルパ。
/// `digits_start` は最初の 8 進数字（`\\` の直後）の位置。
/// 戻り値の `consumed` は `\\` の 1 バイトを含む。
fn decode_octal(input: &[u8], digits_start: usize) -> Option<(Option<u8>, usize)> {
    // acc は u16 で累積（最大値 \\777 = 511 < u16::MAX）。最後に `& 0xFF` で下位 8 ビット採用。
    let mut acc: u16 = 0;
    let mut digits: usize = 0;
    while digits < 3 {
        let pos = digits_start.checked_add(digits)?;
        let Some(&b) = input.get(pos) else { break };
        if !(b'0'..=b'7').contains(&b) {
            break;
        }
        acc = acc * 8 + (b - b'0') as u16;
        digits += 1;
    }
    let consumed = 1usize.checked_add(digits)?;
    Some((Some((acc & 0xFF) as u8), consumed))
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
mod tests {
    use super::*;

    // ========================================================================
    // Phase 11-A: 早期 None（先頭バイト不適合）
    // ========================================================================

    #[test]
    fn read_literal_string_returns_none_for_empty_input() {
        // 空入力で None を返し pos == 0 を維持することを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_at_eof() {
        // 1 バイトを advance で消費した EOF 状態で None を返し pos == 1 を維持することを確認する
        let mut lexer = Lexer::new(b"a");
        let _ = lexer.advance();
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_literal_string_returns_none_for_non_paren_leading_byte() {
        // 先頭が非 '(' バイト 'a' の入力で None を返し pos == 0 を維持することを確認する
        let mut lexer = Lexer::new(b"abc");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_every_leading_whitespace_byte() {
        // whitespace 6 種（NUL/TAB/LF/FF/CR/SP）を先頭に置いた全 6 組で None・pos == 0 を確認する
        for w in [0x00u8, 0x09, 0x0A, 0x0C, 0x0D, 0x20] {
            let input = [w];
            let mut lexer = Lexer::new(&input);
            assert_eq!(lexer.read_literal_string(), None, "whitespace 0x{:02X}", w);
            assert_eq!(lexer.position(), 0, "whitespace 0x{:02X}", w);
        }
    }

    #[test]
    fn read_literal_string_returns_none_for_every_non_open_paren_delimiter_byte() {
        // delimiter 10 種から '(' を除いた 9 種で None・pos == 0 を確認する
        for d in [b')', b'<', b'>', b'[', b']', b'{', b'}', b'/', b'%'] {
            let input = [d];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_literal_string(),
                None,
                "delimiter {:?}",
                d as char
            );
            assert_eq!(lexer.position(), 0, "delimiter {:?}", d as char);
        }
    }

    // ========================================================================
    // Phase 11-B: 空・単純 ASCII
    // ========================================================================

    #[test]
    fn read_literal_string_reads_empty_string() {
        // b"()" で Some(b"") を返し pos == 2 で停止することを確認する
        let mut lexer = Lexer::new(b"()");
        assert_eq!(lexer.read_literal_string(), Some(b"".to_vec()));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_literal_string_reads_simple_ascii() {
        // b"(abc)" で Some(b"abc") を返し pos == 5 で停止することを確認する
        let mut lexer = Lexer::new(b"(abc)");
        assert_eq!(lexer.read_literal_string(), Some(b"abc".to_vec()));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_literal_string_reads_single_byte_string() {
        // 1 バイト文字列 b"(x)" で Some(b"x") を返し pos == 3 で停止することを確認する（桁数別の三角測量）
        let mut lexer = Lexer::new(b"(x)");
        assert_eq!(lexer.read_literal_string(), Some(b"x".to_vec()));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_literal_string_success_at_mid_buffer_advances_correctly() {
        // b"x(a)y" で先頭 1 バイト advance 後に呼び出すと Some(b"a")・pos == 4・後続 b'y' が見えることを確認する
        let mut lexer = Lexer::new(b"x(a)y");
        let _ = lexer.advance();
        assert_eq!(lexer.read_literal_string(), Some(b"a".to_vec()));
        assert_eq!(lexer.position(), 4);
        assert_eq!(lexer.peek(), Some(b'y'));
    }

    #[test]
    fn read_literal_string_success_stops_just_after_closing_paren() {
        // b"(a)b" で Some(b"a")・pos == 3 で停止し、閉じ ')' の直後で後続 b'b' を消費しないことを確認する
        let mut lexer = Lexer::new(b"(a)b");
        assert_eq!(lexer.read_literal_string(), Some(b"a".to_vec()));
        assert_eq!(lexer.position(), 3);
        assert_eq!(lexer.peek(), Some(b'b'));
    }

    // ========================================================================
    // Phase 11-C: バランスネスト
    // ========================================================================

    #[test]
    fn read_literal_string_reads_balanced_nest_one_level() {
        // b"(a(b)c)" でネスト内の '(' / ')' をそのまま含み Some(b"a(b)c")・pos == 7 を返すことを確認する
        let mut lexer = Lexer::new(b"(a(b)c)");
        assert_eq!(lexer.read_literal_string(), Some(b"a(b)c".to_vec()));
        assert_eq!(lexer.position(), 7);
    }

    #[test]
    fn read_literal_string_reads_deeply_nested_string() {
        // 深さ 3 の b"((()))" で内側 b"(())"・pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"((()))");
        assert_eq!(lexer.read_literal_string(), Some(b"(())".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_reads_sibling_nests() {
        // 兄弟ネスト b"(()())" で b"()()"・pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(()())");
        assert_eq!(lexer.read_literal_string(), Some(b"()()".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    // ========================================================================
    // Phase 11-D: エスケープ 8 種
    // ========================================================================

    #[test]
    fn read_literal_string_decodes_escape_n() {
        // b"(\\n)" で改行 LF (0x0A) にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\n)");
        assert_eq!(lexer.read_literal_string(), Some(b"\n".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_r() {
        // b"(\\r)" で復帰 CR (0x0D) にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\r)");
        assert_eq!(lexer.read_literal_string(), Some(b"\r".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_t() {
        // b"(\\t)" でタブ HT (0x09) にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\t)");
        assert_eq!(lexer.read_literal_string(), Some(b"\t".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_b() {
        // b"(\\b)" でバックスペース BS (0x08) にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\b)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x08".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_f() {
        // b"(\\f)" でフォームフィード FF (0x0C) にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\f)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x0C".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_left_paren() {
        // b"(\\()" でリテラル '(' にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\()");
        assert_eq!(lexer.read_literal_string(), Some(b"(".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_right_paren() {
        // b"(\\))" でリテラル ')' にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\))");
        assert_eq!(lexer.read_literal_string(), Some(b")".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_escape_backslash() {
        // b"(\\\\)" でリテラル '\\' にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\\\)");
        assert_eq!(lexer.read_literal_string(), Some(b"\\".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    // ========================================================================
    // Phase 11-E: 8 進エスケープ greediness（最大 3 桁・mod 256）
    // ========================================================================

    #[test]
    fn read_literal_string_decodes_octal_three_digits() {
        // b"(\\101)" で 3 桁 8 進 'A' (0x41) にデコードし pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\101)");
        assert_eq!(lexer.read_literal_string(), Some(b"A".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_decodes_octal_two_digits_followed_by_space() {
        // b"(\\12 )" で 2 桁 8 進終端後 LF + space を保持し pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\12 )");
        assert_eq!(lexer.read_literal_string(), Some(b"\n ".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_decodes_octal_one_digit_followed_by_8() {
        // b"(\\189)" で 1 桁 8 進 0x01 + リテラル '8' '9' を保持し pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\189)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x0189".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_decodes_octal_one_digit_followed_by_paren() {
        // b"(\\1)" で 1 桁 8 進 0x01 のみ保持し pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\1)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x01".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_decodes_octal_greedy_three_digits_then_literal() {
        // b"(\\1234)" で 3 桁 greedy → 'S' (0x53) + リテラル '4' を保持し pos == 7 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\1234)");
        assert_eq!(lexer.read_literal_string(), Some(b"S4".to_vec()));
        assert_eq!(lexer.position(), 7);
    }

    #[test]
    fn read_literal_string_decodes_octal_overflow_mod_256() {
        // b"(\\777)" で 8 進 511 を下位 8 ビット採用で 0xFF にデコードし pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\777)");
        assert_eq!(lexer.read_literal_string(), Some(b"\xFF".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_decodes_octal_zero() {
        // b"(\\0)" で 1 桁 8 進 0 を NUL にデコードし pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\0)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    // ========================================================================
    // Phase 11-F: 裸 EOL 正規化
    // ========================================================================

    #[test]
    fn read_literal_string_normalizes_bare_lf() {
        // 裸 LF を含む b"(a\nb)" で LF をそのまま保持し pos == 5 を返すことを確認する
        let mut lexer = Lexer::new(b"(a\nb)");
        assert_eq!(lexer.read_literal_string(), Some(b"a\nb".to_vec()));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_literal_string_normalizes_bare_cr_to_lf() {
        // 裸 CR を含む b"(a\rb)" で CR を LF に正規化し pos == 5 を返すことを確認する
        let mut lexer = Lexer::new(b"(a\rb)");
        assert_eq!(lexer.read_literal_string(), Some(b"a\nb".to_vec()));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_literal_string_normalizes_bare_crlf_to_lf() {
        // 裸 CRLF を含む b"(a\r\nb)" で CRLF を 1 個の LF に正規化し pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(a\r\nb)");
        assert_eq!(lexer.read_literal_string(), Some(b"a\nb".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    // ========================================================================
    // Phase 11-G: 行継続（行末 \ + EOL）
    // ========================================================================

    #[test]
    fn read_literal_string_handles_line_continuation_lf() {
        // b"(a\\\nb)" で \\ + LF が行継続として出力に追加されず pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(a\\\nb)");
        assert_eq!(lexer.read_literal_string(), Some(b"ab".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_handles_line_continuation_cr() {
        // b"(a\\\rb)" で \\ + CR が行継続として出力に追加されず pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(a\\\rb)");
        assert_eq!(lexer.read_literal_string(), Some(b"ab".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_handles_line_continuation_crlf() {
        // b"(a\\\r\nb)" で \\ + CRLF が行継続として出力に追加されず pos == 7 を返すことを確認する
        let mut lexer = Lexer::new(b"(a\\\r\nb)");
        assert_eq!(lexer.read_literal_string(), Some(b"ab".to_vec()));
        assert_eq!(lexer.position(), 7);
    }

    // ========================================================================
    // Phase 11-H: 未知エスケープ（バックスラッシュ捨て）
    // ========================================================================

    #[test]
    fn read_literal_string_unknown_escape_drops_backslash() {
        // b"(\\x)" で未知エスケープがバックスラッシュ捨て + 'x' 保持となり pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\x)");
        assert_eq!(lexer.read_literal_string(), Some(b"x".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_unknown_escape_with_exclamation() {
        // b"(\\!)" で未知エスケープ '!' をそのまま保持し pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\!)");
        assert_eq!(lexer.read_literal_string(), Some(b"!".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_literal_string_unknown_escape_with_uppercase_letter() {
        // b"(\\A)" で 8 進数字外の 'A' を未知エスケープ扱いで保持し pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\A)");
        assert_eq!(lexer.read_literal_string(), Some(b"A".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    // ========================================================================
    // Phase 11-I: 未終端 / 巻き戻し（異常系）
    // ========================================================================

    #[test]
    fn read_literal_string_returns_none_for_unterminated_string() {
        // 閉じ ')' のない b"(abc" で None を返し pos == 0 に完全巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(abc");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_unterminated_nested() {
        // ネスト未閉鎖 b"(a(b" で None を返し pos == 0 に完全巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(a(b");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_lone_open_paren() {
        // 単独 '(' で None を返し pos == 0 に完全巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_bare_backslash_at_eof() {
        // b"(\\" の \\ 直後 EOF で次反復が本体で EOF を検出して None・pos == 0 に巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(\\");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_line_continuation_then_eof() {
        // b"(a\\\n" で行継続後すぐ EOF となり None・pos == 0 に巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(a\\\n");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_line_continuation_crlf_then_eof() {
        // b"(a\\\r\n" で CRLF 行継続後すぐ EOF となり None・pos == 0 に巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(a\\\r\n");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_returns_none_for_unknown_escape_then_eof() {
        // b"(\\x" で未知エスケープ後すぐ EOF となり None・pos == 0 に巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"(\\x");
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_literal_string_failure_at_mid_buffer_rolls_back_to_call_site() {
        // b"xabc" で advance 後 pos == 1 から呼び None・pos == 1 に完全巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"xabc");
        let _ = lexer.advance();
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_literal_string_unterminated_at_mid_buffer_rolls_back_to_call_site() {
        // b"x(abc" で advance 後 pos == 1 から呼び未終端で None・pos == 1 に完全巻き戻しすることを確認する
        let mut lexer = Lexer::new(b"x(abc");
        let _ = lexer.advance();
        assert_eq!(lexer.read_literal_string(), None);
        assert_eq!(lexer.position(), 1);
    }

    // ========================================================================
    // Phase 11-J: 非 ASCII / NUL / 高位バイト保持
    // ========================================================================

    #[test]
    fn read_literal_string_preserves_nul_byte() {
        // b"(\x00)" で NUL バイトをそのまま保持し pos == 3 を返すことを確認する
        let mut lexer = Lexer::new(b"(\x00)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_literal_string_preserves_high_byte() {
        // b"(\xFF)" で 0xFF バイトをそのまま保持し pos == 3 を返すことを確認する
        let mut lexer = Lexer::new(b"(\xFF)");
        assert_eq!(lexer.read_literal_string(), Some(b"\xFF".to_vec()));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_literal_string_preserves_non_utf8_sequence() {
        // b"(\x80\xC0)" で非 UTF-8 連続バイト列をそのまま保持し pos == 4 を返すことを確認する
        let mut lexer = Lexer::new(b"(\x80\xC0)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x80\xC0".to_vec()));
        assert_eq!(lexer.position(), 4);
    }

    // ========================================================================
    // decode_escape 純関数の単体テスト
    // ========================================================================

    #[test]
    fn decode_escape_decodes_simple_n() {
        // input=b"\\n" pos=0 で decode_escape が (Some(0x0A), 2) を返すことを確認する
        let input = b"\\n";
        assert_eq!(decode_escape(input, 0), Some((Some(0x0A), 2)));
    }

    #[test]
    fn decode_escape_decodes_simple_backslash() {
        // input=b"\\\\" pos=0 で decode_escape が (Some(b'\\'), 2) を返すことを確認する
        let input = b"\\\\";
        assert_eq!(decode_escape(input, 0), Some((Some(b'\\'), 2)));
    }

    #[test]
    fn decode_escape_decodes_octal_three_digits() {
        // input=b"\\101" pos=0 で decode_escape が (Some(0x41), 4) を返すことを確認する
        let input = b"\\101";
        assert_eq!(decode_escape(input, 0), Some((Some(0x41), 4)));
    }

    #[test]
    fn decode_escape_decodes_octal_two_digits_terminated_by_non_octal() {
        // input=b"\\12x" pos=0 で 2 桁で打ち止めとなり (Some(0x0A), 3) を返すことを確認する
        let input = b"\\12x";
        assert_eq!(decode_escape(input, 0), Some((Some(0x0A), 3)));
    }

    #[test]
    fn decode_escape_decodes_octal_overflow_mod_256() {
        // input=b"\\777" pos=0 で 8 進 511 を下位 8 ビット採用で (Some(0xFF), 4) を返すことを確認する
        let input = b"\\777";
        assert_eq!(decode_escape(input, 0), Some((Some(0xFF), 4)));
    }

    #[test]
    fn decode_escape_returns_skip_for_line_continuation_lf() {
        // input=b"\\\n" pos=0 で行継続 LF が (None, 2) を返すことを確認する
        let input = b"\\\n";
        assert_eq!(decode_escape(input, 0), Some((None, 2)));
    }

    #[test]
    fn decode_escape_returns_skip_for_line_continuation_crlf() {
        // input=b"\\\r\n" pos=0 で行継続 CRLF が (None, 3) を返すことを確認する
        let input = b"\\\r\n";
        assert_eq!(decode_escape(input, 0), Some((None, 3)));
    }

    #[test]
    fn decode_escape_returns_skip_for_line_continuation_cr() {
        // input=b"\\\r" pos=0 で行継続 CR が (None, 2) を返すことを確認する
        let input = b"\\\r";
        assert_eq!(decode_escape(input, 0), Some((None, 2)));
    }

    #[test]
    fn decode_escape_returns_skip_for_eof_after_backslash() {
        // input=b"\\" pos=0 で \\ 直後 EOF が (None, 1) を返すことを確認する
        let input = b"\\";
        assert_eq!(decode_escape(input, 0), Some((None, 1)));
    }

    #[test]
    fn decode_escape_decodes_unknown_to_literal() {
        // input=b"\\x" pos=0 で未知エスケープが (Some(b'x'), 2) を返すことを確認する
        let input = b"\\x";
        assert_eq!(decode_escape(input, 0), Some((Some(b'x'), 2)));
    }

    // decode_escape 簡易エスケープ 8 種網羅（n / \\ は既出）

    #[test]
    fn decode_escape_decodes_simple_r() {
        // input=b"\\r" pos=0 で decode_escape が (Some(0x0D), 2) を返すことを確認する
        let input = b"\\r";
        assert_eq!(decode_escape(input, 0), Some((Some(0x0D), 2)));
    }

    #[test]
    fn decode_escape_decodes_simple_t() {
        // input=b"\\t" pos=0 で decode_escape が (Some(0x09), 2) を返すことを確認する
        let input = b"\\t";
        assert_eq!(decode_escape(input, 0), Some((Some(0x09), 2)));
    }

    #[test]
    fn decode_escape_decodes_simple_b() {
        // input=b"\\b" pos=0 で decode_escape が (Some(0x08), 2) を返すことを確認する
        let input = b"\\b";
        assert_eq!(decode_escape(input, 0), Some((Some(0x08), 2)));
    }

    #[test]
    fn decode_escape_decodes_simple_f() {
        // input=b"\\f" pos=0 で decode_escape が (Some(0x0C), 2) を返すことを確認する
        let input = b"\\f";
        assert_eq!(decode_escape(input, 0), Some((Some(0x0C), 2)));
    }

    #[test]
    fn decode_escape_decodes_simple_left_paren() {
        // input=b"\\(" pos=0 で decode_escape が (Some(b'('), 2) を返すことを確認する
        let input = b"\\(";
        assert_eq!(decode_escape(input, 0), Some((Some(b'('), 2)));
    }

    #[test]
    fn decode_escape_decodes_simple_right_paren() {
        // input=b"\\)" pos=0 で decode_escape が (Some(b')'), 2) を返すことを確認する
        let input = b"\\)";
        assert_eq!(decode_escape(input, 0), Some((Some(b')'), 2)));
    }

    // ========================================================================
    // decode_octal 内部ヘルパの直接単体テスト
    // ========================================================================

    #[test]
    fn decode_octal_one_digit_zero() {
        // input=b"0" digits_start=0 で 1 桁 8 進 0 が (Some(0x00), 2) を返すことを確認する
        let input = b"0";
        assert_eq!(decode_octal(input, 0), Some((Some(0x00), 2)));
    }

    #[test]
    fn decode_octal_one_digit_seven() {
        // input=b"7" digits_start=0 で 1 桁 8 進 7 が (Some(0x07), 2) を返すことを確認する
        let input = b"7";
        assert_eq!(decode_octal(input, 0), Some((Some(0x07), 2)));
    }

    #[test]
    fn decode_octal_three_digits_max() {
        // input=b"377" digits_start=0 で 3 桁 8 進 255 が (Some(0xFF), 4) を返すことを確認する
        let input = b"377";
        assert_eq!(decode_octal(input, 0), Some((Some(0xFF), 4)));
    }

    #[test]
    fn decode_octal_three_digits_400_wraps_to_zero() {
        // input=b"400" digits_start=0 で 3 桁 8 進 256 が下位 8 ビット採用で (Some(0x00), 4) を返すことを確認する
        let input = b"400";
        assert_eq!(decode_octal(input, 0), Some((Some(0x00), 4)));
    }

    #[test]
    fn decode_octal_three_digits_zero() {
        // input=b"000" digits_start=0 で 3 桁全 0 が (Some(0x00), 4) を返し digits == 3 で greedy 打ち止めを確認する
        let input = b"000";
        assert_eq!(decode_octal(input, 0), Some((Some(0x00), 4)));
    }

    #[test]
    fn decode_octal_terminated_by_non_octal_after_one_digit() {
        // input=b"1x" digits_start=0 で 1 桁で打ち止めとなり (Some(0x01), 2) を返すことを確認する
        let input = b"1x";
        assert_eq!(decode_octal(input, 0), Some((Some(0x01), 2)));
    }

    // ========================================================================
    // read_literal_string 8 進境界値テスト追加
    // ========================================================================

    #[test]
    fn read_literal_string_decodes_octal_400_wraps_to_zero() {
        // b"(\\400)" で 8 進 256 を下位 8 ビット採用で 0x00 にデコードし pos == 6 を返すことを確認する
        let mut lexer = Lexer::new(b"(\\400)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_literal_string_decodes_octal_000_three_digit_zero() {
        // b"(\\000)" で 3 桁全 0 を NUL にデコードし pos == 6 を返し greedy が 3 桁で打ち止めとなることを確認する
        let mut lexer = Lexer::new(b"(\\000)");
        assert_eq!(lexer.read_literal_string(), Some(b"\x00".to_vec()));
        assert_eq!(lexer.position(), 6);
    }
}
