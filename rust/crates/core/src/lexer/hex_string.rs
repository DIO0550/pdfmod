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
mod tests {
    use super::*;

    // ========================================================================
    // Phase 1: 早期 None（先頭バイト不適合）
    // ========================================================================

    #[test]
    fn read_hex_string_returns_none_for_empty_input() {
        // 空入力で None を返し pos == 0 を維持することを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_at_eof() {
        // 1 バイトを advance で消費した EOF 状態で None を返し pos == 1 を維持することを確認する
        let mut lexer = Lexer::new(b"a");
        let _ = lexer.advance();
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_hex_string_returns_none_when_not_starting_with_open_angle() {
        // 先頭が '<' でないバイト（'[' / '(' / '/' / '0' / 'x'）で None・pos == 0 を確認する
        for &b in b"[(/0x" {
            let input = [b];
            let mut lexer = Lexer::new(&input);
            assert_eq!(lexer.read_hex_string(), None, "byte 0x{:02X}", b);
            assert_eq!(lexer.position(), 0, "byte 0x{:02X}", b);
        }
    }

    #[test]
    fn read_hex_string_returns_none_for_every_leading_whitespace_byte() {
        // whitespace 6 種（NUL/TAB/LF/FF/CR/SP）を先頭に置いた全 6 組で None・pos == 0 を確認する
        for w in [0x00u8, 0x09, 0x0A, 0x0C, 0x0D, 0x20] {
            let input = [w];
            let mut lexer = Lexer::new(&input);
            assert_eq!(lexer.read_hex_string(), None, "whitespace 0x{:02X}", w);
            assert_eq!(lexer.position(), 0, "whitespace 0x{:02X}", w);
        }
    }

    #[test]
    fn read_hex_string_returns_none_for_leading_delimiters_other_than_open_angle() {
        // delimiter 10 種から '<' を除いた 9 種で None・pos == 0 を確認する
        for d in [b'(', b')', b'>', b'[', b']', b'{', b'}', b'/', b'%'] {
            let input = [d];
            let mut lexer = Lexer::new(&input);
            assert_eq!(lexer.read_hex_string(), None, "delimiter {:?}", d as char);
            assert_eq!(lexer.position(), 0, "delimiter {:?}", d as char);
        }
    }

    // ========================================================================
    // Phase 2: 空文字列 `<>`
    // ========================================================================

    #[test]
    fn read_hex_string_reads_empty_hex_string() {
        // 空 16 進文字列 <> が Some(vec![]) を返し pos が 2 へ進むことを確認する
        let mut lexer = Lexer::new(b"<>");
        assert_eq!(lexer.read_hex_string(), Some(vec![]));
        assert_eq!(lexer.position(), 2);
    }

    // ========================================================================
    // Phase 3: 基本（偶数桁 ASCII / 高位バイト / NUL 含む）
    // ========================================================================

    #[test]
    fn read_hex_string_reads_hello_ascii() {
        // <48656C6C6F> が b"Hello" にデコードされ pos が閉じ '>' 直後 12 を指すことを確認する
        let mut lexer = Lexer::new(b"<48656C6C6F>");
        assert_eq!(lexer.read_hex_string(), Some(b"Hello".to_vec()));
        assert_eq!(lexer.position(), 12);
    }

    #[test]
    fn read_hex_string_reads_single_byte() {
        // <41> が単一バイト 0x41 にデコードされ pos が 4 を指すことを確認する
        let mut lexer = Lexer::new(b"<41>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x41]));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_hex_string_reads_high_bit_bytes() {
        // <FFEE80> が非 ASCII 高位バイト 3 件にデコードされることを確認する
        let mut lexer = Lexer::new(b"<FFEE80>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xFF, 0xEE, 0x80]));
        assert_eq!(lexer.position(), 8);
    }

    #[test]
    fn read_hex_string_preserves_null_byte() {
        // <0041> が NUL 0x00 と 'A' 0x41 を含むバイト列にデコードされることを確認する
        let mut lexer = Lexer::new(b"<0041>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x00, 0x41]));
    }

    #[test]
    fn read_hex_string_stops_at_closing_angle_and_leaves_subsequent_token() {
        // 閉じ '>' の直後で停止し後続トークンを消費しないことを 2 入力で確認する
        let mut lexer1 = Lexer::new(b"<41>/Name");
        assert_eq!(lexer1.read_hex_string(), Some(vec![0x41]));
        assert_eq!(lexer1.position(), 4);
        assert_eq!(lexer1.peek(), Some(b'/'));

        let mut lexer2 = Lexer::new(b"<41> 0 R");
        assert_eq!(lexer2.read_hex_string(), Some(vec![0x41]));
        assert_eq!(lexer2.position(), 4);
        assert_eq!(lexer2.peek(), Some(b' '));
    }

    // ========================================================================
    // Phase 4: 奇数桁補完（末尾に 0 を付与）
    // ========================================================================

    #[test]
    fn read_hex_string_pads_single_digit_with_zero() {
        // <F> が ISO 32000-1 §7.3.4.3 に従い 0xF0 にデコードされることを確認する
        let mut lexer = Lexer::new(b"<F>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xF0]));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_hex_string_pads_three_digits_with_zero() {
        // <ABC> が AB + C0 にデコードされることを確認する（三角測量: 1桁 → 3桁 一般化）
        let mut lexer = Lexer::new(b"<ABC>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xAB, 0xC0]));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_hex_string_pads_five_digits_with_zero() {
        // <48656C6C6> が Hell + 0x60 にデコードされることを確認する
        let mut lexer = Lexer::new(b"<48656C6C6>");
        assert_eq!(
            lexer.read_hex_string(),
            Some(vec![0x48, 0x65, 0x6C, 0x6C, 0x60])
        );
    }

    // ========================================================================
    // Phase 5: 大文字小文字（等価扱い）
    // ========================================================================

    #[test]
    fn read_hex_string_accepts_lowercase_hex() {
        // 小文字 16 進数字 <abcdef> が正しくデコードされることを確認する
        let mut lexer = Lexer::new(b"<abcdef>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
    }

    #[test]
    fn read_hex_string_accepts_uppercase_hex() {
        // 大文字 16 進数字 <ABCDEF> が正しくデコードされることを確認する
        let mut lexer = Lexer::new(b"<ABCDEF>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
    }

    #[test]
    fn read_hex_string_accepts_mixed_case_hex() {
        // 大小混在 <aBcDeF> / <AbCdEf> が同じバイト列にデコードされることを確認する
        let mut lexer1 = Lexer::new(b"<aBcDeF>");
        assert_eq!(lexer1.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
        let mut lexer2 = Lexer::new(b"<AbCdEf>");
        assert_eq!(lexer2.read_hex_string(), Some(vec![0xAB, 0xCD, 0xEF]));
    }

    #[test]
    fn read_hex_string_treats_upper_and_lower_as_equivalent() {
        // 大文字小文字の入れ替え <aA> と <Aa> が共に 0xAA を返すことを確認する
        let mut lexer1 = Lexer::new(b"<aA>");
        assert_eq!(lexer1.read_hex_string(), Some(vec![0xAA]));
        let mut lexer2 = Lexer::new(b"<Aa>");
        assert_eq!(lexer2.read_hex_string(), Some(vec![0xAA]));
    }

    // ========================================================================
    // Phase 6: 内部 whitespace スキップ（PDF §7.2.2 6 バイト）
    // ========================================================================

    #[test]
    fn read_hex_string_skips_space_between_digits() {
        // 数字間の SP が無視され <48 65 6C 6C 6F> が b"Hello" にデコードされることを確認する
        let mut lexer = Lexer::new(b"<48 65 6C 6C 6F>");
        assert_eq!(lexer.read_hex_string(), Some(b"Hello".to_vec()));
    }

    #[test]
    fn read_hex_string_skips_newlines_and_tabs_between_digits() {
        // TAB/LF/CR/FF が無視され混在 whitespace でも b"Hello" にデコードされることを確認する
        let mut lexer = Lexer::new(b"<48\t65\n6C\r6C\x0C6F>");
        assert_eq!(lexer.read_hex_string(), Some(b"Hello".to_vec()));
    }

    #[test]
    fn read_hex_string_skips_every_whitespace_byte_between_digits() {
        // whitespace 6 種を 1 種ずつ挟んだ全パターンで b"Hi" にデコードされることを確認する
        for w in [0x00u8, 0x09, 0x0A, 0x0C, 0x0D, 0x20] {
            let mut input = Vec::new();
            input.push(b'<');
            input.extend_from_slice(b"48");
            input.push(w);
            input.extend_from_slice(b"69");
            input.push(b'>');
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_hex_string(),
                Some(vec![0x48, 0x69]),
                "whitespace 0x{:02X}",
                w
            );
        }
    }

    #[test]
    fn read_hex_string_skips_whitespace_inside_pair() {
        // ペア内部の whitespace <4 8> が 1 バイト 0x48 にデコードされ high 状態が破壊されないことを確認する
        let mut lexer = Lexer::new(b"<4 8>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x48]));
    }

    #[test]
    fn read_hex_string_skips_leading_whitespace_after_open() {
        // 開き '<' 直後の whitespace < 4865> が正しくデコードされることを確認する
        let mut lexer = Lexer::new(b"< 4865>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x48, 0x65]));
    }

    #[test]
    fn read_hex_string_skips_trailing_whitespace_before_close() {
        // 閉じ '>' 直前の whitespace <4865 > が正しくデコードされることを確認する
        let mut lexer = Lexer::new(b"<4865 >");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x48, 0x65]));
    }

    #[test]
    fn read_hex_string_treats_whitespace_only_as_empty() {
        // whitespace のみ <   > が空バイト列 vec![] にデコードされることを確認する
        let mut lexer = Lexer::new(b"<   >");
        assert_eq!(lexer.read_hex_string(), Some(vec![]));
    }

    #[test]
    fn read_hex_string_pads_odd_digit_followed_by_whitespace() {
        // 奇数桁 + 末尾 whitespace <F > が 0xF0 にデコードされ high 状態が '>' 分岐まで保持されることを確認する
        let mut lexer = Lexer::new(b"<F >");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xF0]));
    }

    #[test]
    fn read_hex_string_skips_null_byte_inside() {
        // NUL は PDF §7.2.2 で whitespace 6 種の 1 つでありスキップされることを確認する
        let input = [b'<', 0x00, b'>'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_hex_string(), Some(vec![]));
    }

    // ========================================================================
    // Phase 6.5: バイト忠実性 / 非 ASCII 保持（F-9: lexer は UTF-8 を仮定しない）
    // ========================================================================

    #[test]
    fn read_hex_string_preserves_utf8_japanese_bytes() {
        // <E697A5> が「日」の UTF-8 3 バイトをそのまま保持することを確認する
        let mut lexer = Lexer::new(b"<E697A5>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xE6, 0x97, 0xA5]));
    }

    #[test]
    fn read_hex_string_preserves_consecutive_utf8_multibyte() {
        // <E697A5E69CACE8AA9E> が「日本語」UTF-8 9 バイトをそのまま保持することを確認する
        let mut lexer = Lexer::new(b"<E697A5E69CACE8AA9E>");
        assert_eq!(
            lexer.read_hex_string(),
            Some(vec![0xE6, 0x97, 0xA5, 0xE6, 0x9C, 0xAC, 0xE8, 0xAA, 0x9E])
        );
    }

    #[test]
    fn read_hex_string_preserves_high_bytes_at_boundary() {
        // 高位バイト境界 <80FF> が 0x80 と 0xFF をそのまま保持することを確認する
        let mut lexer = Lexer::new(b"<80FF>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x80, 0xFF]));
    }

    #[test]
    fn read_hex_string_preserves_null_and_max_byte() {
        // NUL と最大値の組み合わせ <00FF> が 0x00 と 0xFF をそのまま保持することを確認する
        let mut lexer = Lexer::new(b"<00FF>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0x00, 0xFF]));
    }

    #[test]
    fn read_hex_string_preserves_invalid_utf8_sequence() {
        // UTF-8 として不正な <C080> も忠実に保持されることを確認する（lexer は UTF-8 を仮定しない）
        let mut lexer = Lexer::new(b"<C080>");
        assert_eq!(lexer.read_hex_string(), Some(vec![0xC0, 0x80]));
    }

    // ========================================================================
    // Phase 7: 不正文字（完全巻き戻し）
    // ========================================================================

    #[test]
    fn read_hex_string_returns_none_for_non_hex_letter() {
        // 非 16 進文字 <XY> で None を返し pos == 0 へ巻き戻ることを確認する
        let mut lexer = Lexer::new(b"<XY>");
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_for_non_hex_after_valid() {
        // 有効 16 進数字に続く不正文字 <48G> で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"<48G>");
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_for_non_ascii_byte() {
        // 非 ASCII バイト 0xFF が内部に出現したら None・pos == 0 巻き戻しを確認する
        let input = [b'<', 0xFF, b'>'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_for_delimiter_inside() {
        // delimiter '(' が内部に混入した <48(65> で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"<48(65>");
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_for_double_open_angle() {
        // '<<' を read_hex_string 単独で呼んでも panic せず None・pos == start 巻き戻しを確認する
        let mut lexer1 = Lexer::new(b"<<");
        assert_eq!(lexer1.read_hex_string(), None);
        assert_eq!(lexer1.position(), 0);

        let mut lexer2 = Lexer::new(b"<< /Type");
        assert_eq!(lexer2.read_hex_string(), None);
        assert_eq!(lexer2.position(), 0);
    }

    // ========================================================================
    // Phase 8: 未終端（EOF 到達 → 完全巻き戻し）
    // ========================================================================

    #[test]
    fn read_hex_string_returns_none_for_unterminated_eof() {
        // 閉じ '>' が無い <48656C で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"<48656C");
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_for_lone_open_angle() {
        // '<' 単独で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"<");
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_hex_string_returns_none_for_open_followed_by_whitespace_eof() {
        // '< ' のみで EOF に達した場合に None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"< ");
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 0);
    }

    // ========================================================================
    // Phase 9: mid-buffer（成功・失敗・未終端の各巻き戻し位置）
    // ========================================================================

    #[test]
    fn read_hex_string_succeeds_after_advance() {
        // advance 後の pos=1 から x<41> を読み開始して pos == 5 へ進むことを確認する
        let mut lexer = Lexer::new(b"x<41>");
        let _ = lexer.advance();
        assert_eq!(lexer.read_hex_string(), Some(vec![0x41]));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_hex_string_rewinds_to_mid_buffer_position_on_failure() {
        // advance 後の pos=1 から x<XY> で失敗し pos == 1 へ巻き戻ることを確認する
        let mut lexer = Lexer::new(b"x<XY>");
        let _ = lexer.advance();
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_hex_string_rewinds_to_mid_buffer_position_on_unterminated() {
        // advance 後の pos=1 から x<48 で未終端時に pos == 1 へ巻き戻ることを確認する
        let mut lexer = Lexer::new(b"x<48");
        let _ = lexer.advance();
        assert_eq!(lexer.read_hex_string(), None);
        assert_eq!(lexer.position(), 1);
    }

    // ========================================================================
    // Phase 10: 横断（pos 不変条件 / pos = usize::MAX panic 不在）
    // ========================================================================

    #[test]
    fn read_hex_string_position_never_exceeds_input_len_on_various_inputs() {
        // 複数入力で呼び出し後の position が input.len() を超えないことを確認する
        let inputs: &[&[u8]] = &[
            b"",
            b"<",
            b"<>",
            b"<41>",
            b"<XY>",
            b"<48656C6C6F>",
            b"<F>",
            b"<48 65>",
        ];
        for input in inputs {
            let mut lexer = Lexer::new(input);
            let _ = lexer.read_hex_string();
            assert!(
                lexer.position() <= input.len(),
                "position {} exceeds input.len() {} for {:?}",
                lexer.position(),
                input.len(),
                input
            );
        }
    }

    #[test]
    fn read_hex_string_does_not_panic_when_pos_is_usize_max() {
        // pos == usize::MAX で構築しても panic せず pos が巻き戻ることを確認する
        let mut lexer = Lexer {
            input: b"<41>",
            pos: usize::MAX,
        };
        let result = lexer.read_hex_string();
        assert!(result.is_none());
        assert_eq!(lexer.position(), usize::MAX);
    }
}
