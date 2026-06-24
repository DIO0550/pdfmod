use super::*;

mod lexer_advance;
mod lexer_is_eof;
mod lexer_new_position;
mod lexer_peek;
mod lexer_skip_comment;
mod lexer_skip_whitespace;
mod lexer_skip_ws_and_comments;

// ---------- Phase 7: 横断（panic 不在 / 不変条件 / 結合） ----------

#[test]
fn all_apis_do_not_panic_at_eof() {
    // EOF 状態で全 API を順に呼んでも panic せず pos が input.len() を維持することを確認する
    let mut lexer = Lexer::new(b"ab");
    lexer.advance();
    lexer.advance();
    let len = 2;
    let _ = lexer.peek();
    let _ = lexer.peek_at(0);
    let _ = lexer.peek_at(usize::MAX);
    let _ = lexer.advance();
    lexer.skip_whitespace();
    let _ = lexer.skip_comment();
    lexer.skip_whitespace_and_comments();
    let _ = lexer.read_integer();
    let _ = lexer.read_real();
    let _ = lexer.read_name();
    let _ = lexer.read_literal_string();
    let _ = lexer.read_hex_string();
    let _ = lexer.read_array_begin();
    let _ = lexer.read_array_end();
    let _ = lexer.read_dict_begin();
    let _ = lexer.read_dict_end();
    let _ = lexer.read_keyword();
    let _ = lexer.next_token();
    assert_eq!(lexer.position(), len);
    assert!(lexer.is_eof());
}

#[test]
fn all_apis_do_not_panic_for_empty_input() {
    // 空入力で全 API を順に呼んでも panic せず pos が 0 を維持することを確認する
    let mut lexer = Lexer::new(&[]);
    let _ = lexer.peek();
    let _ = lexer.peek_at(0);
    let _ = lexer.peek_at(usize::MAX);
    let _ = lexer.advance();
    lexer.skip_whitespace();
    let _ = lexer.skip_comment();
    lexer.skip_whitespace_and_comments();
    let _ = lexer.read_integer();
    let _ = lexer.read_real();
    let _ = lexer.read_name();
    let _ = lexer.read_literal_string();
    let _ = lexer.read_hex_string();
    let _ = lexer.read_array_begin();
    let _ = lexer.read_array_end();
    let _ = lexer.read_dict_begin();
    let _ = lexer.read_dict_end();
    let _ = lexer.read_keyword();
    let _ = lexer.next_token();
    assert_eq!(lexer.position(), 0);
}

#[test]
fn position_never_exceeds_input_len_after_skip() {
    // 各種入力で skip 系と read 系を呼んだ後 position が input.len() を超えないことを確認する
    let inputs: &[&[u8]] = &[b"", b" ", b"%c\n", b" %a\n %b\n"];
    for input in inputs {
        let mut lexer = Lexer::new(input);
        lexer.skip_whitespace();
        assert!(lexer.position() <= input.len());
        let _ = lexer.skip_comment();
        assert!(lexer.position() <= input.len());
        lexer.skip_whitespace_and_comments();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_array_begin();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_array_end();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_dict_begin();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_dict_end();
        assert!(lexer.position() <= input.len());
        let _ = lexer.read_keyword();
        assert!(lexer.position() <= input.len());
        let _ = lexer.next_token();
        assert!(lexer.position() <= input.len());
    }
}

#[test]
fn skip_comment_after_skip_whitespace_processes_pdf_header_then_body() {
    // PDF ヘッダ風の結合入力で合成 API 1 回呼び出し後に peek が本文先頭 'b' を指すことを確認する
    let mut lexer = Lexer::new(b"\n%PDF-1.7\nbody");
    lexer.skip_whitespace_and_comments();
    assert_eq!(lexer.peek(), Some(b'b'));
}

// ---------- Phase 8: read_integer ----------

// Phase 8-A: 早期 None（先頭バイトが該当せず pos 不変）

#[test]
fn read_integer_returns_none_for_empty_input() {
    // 空入力に対する read_integer が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_at_eof() {
    // EOF 状態の read_integer が None を返し pos が EOF 位置のままであることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_integer_returns_none_for_leading_whitespace() {
    // 先頭が whitespace の入力で read_integer が None・pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(b" 123");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_leading_delimiter() {
    // 先頭が delimiter '(' の入力で read_integer が None・pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(b"(123");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_every_leading_delimiter_byte() {
    // 仕様 §2.2 の delimiter 10 バイト全てを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for d in delimiter_bytes {
        let input = [d, b'1', b'2', b'3'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_integer(),
            None,
            "delimiter 0x{d:02X} should yield None"
        );
        assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
    }
}

#[test]
fn read_integer_returns_none_for_every_leading_whitespace_byte() {
    // 仕様 §2.1 の whitespace 6 バイト全てを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [w, b'1', b'2', b'3'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_integer(),
            None,
            "whitespace 0x{w:02X} should yield None"
        );
        assert_eq!(
            lexer.position(),
            0,
            "whitespace 0x{w:02X} should keep pos 0"
        );
    }
}

#[test]
fn read_integer_returns_none_for_leading_non_digit_regular_byte() {
    // 先頭が非数字 regular の入力で read_integer が None・pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_lone_plus_at_eof() {
    // 符号 '+' のみで EOF の入力が None を返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"+");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_lone_minus_at_eof() {
    // 符号 '-' のみで EOF の入力が None を返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"-");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_plus_then_non_digit_regular() {
    // '+' の直後が非数字 regular のとき None を返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"+x");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_minus_then_delimiter() {
    // '-' の直後が delimiter のとき None を返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"-(");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_plus_then_whitespace() {
    // '+' の直後が whitespace のとき None を返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"+ ");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_sign_then_every_delimiter_byte() {
    // 符号 ∈ {+, -} × delimiter 10 種の全 20 組で None・pos 0 に巻き戻されることを確認する
    let signs = [b'+', b'-'];
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for s in signs {
        for d in delimiter_bytes {
            let input = [s, d];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_integer(),
                None,
                "sign 0x{s:02X} + delimiter 0x{d:02X} should yield None"
            );
            assert_eq!(
                lexer.position(),
                0,
                "sign 0x{s:02X} + delimiter 0x{d:02X} should rollback to 0"
            );
        }
    }
}

#[test]
fn read_integer_returns_none_for_sign_then_every_whitespace_byte() {
    // 符号 ∈ {+, -} × whitespace 6 種の全 12 組で None・pos 0 に巻き戻されることを確認する
    let signs = [b'+', b'-'];
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for s in signs {
        for w in whitespace_bytes {
            let input = [s, w];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_integer(),
                None,
                "sign 0x{s:02X} + whitespace 0x{w:02X} should yield None"
            );
            assert_eq!(
                lexer.position(),
                0,
                "sign 0x{s:02X} + whitespace 0x{w:02X} should rollback to 0"
            );
        }
    }
}

// Phase 8-B: 単一/複数桁の正数（符号なし）

#[test]
fn read_integer_reads_single_digit_zero() {
    // 単一桁 '0' を Some(0) として読み pos を 1 進めることを確認する
    let mut lexer = Lexer::new(b"0");
    assert_eq!(lexer.read_integer(), Some(0));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_integer_reads_single_digit_seven() {
    // 値の三角測量: 単一桁 '7' を Some(7) として読むことを確認する
    let mut lexer = Lexer::new(b"7");
    assert_eq!(lexer.read_integer(), Some(7));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_integer_reads_multi_digit_123() {
    // 桁数の三角測量: 複数桁 '123' を Some(123) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"123");
    assert_eq!(lexer.read_integer(), Some(123));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_integer_reads_leading_zero_padded_00042() {
    // 先頭ゼロ '00042' を Some(42) として読み pos を 5 進めることを確認する（先頭ゼロ許容）
    let mut lexer = Lexer::new(b"00042");
    assert_eq!(lexer.read_integer(), Some(42));
    assert_eq!(lexer.position(), 5);
}

// Phase 8-C: + 付き正数

#[test]
fn read_integer_reads_plus_zero() {
    // '+0' を Some(0) として読み pos を 2 進めることを確認する
    let mut lexer = Lexer::new(b"+0");
    assert_eq!(lexer.read_integer(), Some(0));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_integer_reads_plus_17() {
    // 値の三角測量: '+17' を Some(17) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"+17");
    assert_eq!(lexer.read_integer(), Some(17));
    assert_eq!(lexer.position(), 3);
}

// Phase 8-D: - 付き負数

#[test]
fn read_integer_reads_minus_one() {
    // '-1' を Some(-1) として読み pos を 2 進めることを確認する
    let mut lexer = Lexer::new(b"-1");
    assert_eq!(lexer.read_integer(), Some(-1));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_integer_reads_minus_45() {
    // 値の三角測量: '-45' を Some(-45) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"-45");
    assert_eq!(lexer.read_integer(), Some(-45));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_integer_reads_minus_leading_zero_007() {
    // 負数の先頭ゼロ '-007' を Some(-7) として読み pos を 4 進めることを確認する
    let mut lexer = Lexer::new(b"-007");
    assert_eq!(lexer.read_integer(), Some(-7));
    assert_eq!(lexer.position(), 4);
}

// Phase 8-E: トークン境界

#[test]
fn read_integer_stops_at_whitespace() {
    // 後続が空白の '42 rest' を Some(42) として読み peek が ' ' を指すことを確認する
    let mut lexer = Lexer::new(b"42 rest");
    assert_eq!(lexer.read_integer(), Some(42));
    assert_eq!(lexer.position(), 2);
    assert_eq!(lexer.peek(), Some(b' '));
}

#[test]
fn read_integer_stops_at_delimiter() {
    // 後続が delimiter の '42]rest' を Some(42) として読み peek が ']' を指すことを確認する
    let mut lexer = Lexer::new(b"42]rest");
    assert_eq!(lexer.read_integer(), Some(42));
    assert_eq!(lexer.position(), 2);
    assert_eq!(lexer.peek(), Some(b']'));
}

#[test]
fn read_integer_stops_at_every_delimiter_byte() {
    // '42' + delimiter 10 種の全組で Some(42)・pos 2・peek が当該 delimiter を指すことを確認する
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for d in delimiter_bytes {
        let input = [b'4', b'2', d];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_integer(),
            Some(42),
            "delimiter 0x{d:02X} should still yield Some(42)"
        );
        assert_eq!(lexer.position(), 2, "delimiter 0x{d:02X} should stop at 2");
        assert_eq!(
            lexer.peek(),
            Some(d),
            "delimiter 0x{d:02X} should be the next peek byte"
        );
    }
}

#[test]
fn read_integer_stops_at_every_whitespace_byte() {
    // '42' + whitespace 6 種の全組で Some(42)・pos 2・peek が当該 whitespace を指すことを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [b'4', b'2', w];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_integer(),
            Some(42),
            "whitespace 0x{w:02X} should still yield Some(42)"
        );
        assert_eq!(lexer.position(), 2, "whitespace 0x{w:02X} should stop at 2");
        assert_eq!(
            lexer.peek(),
            Some(w),
            "whitespace 0x{w:02X} should be the next peek byte"
        );
    }
}

#[test]
fn read_integer_stops_at_eof() {
    // EOF 直前の '42' を Some(42) として読み EOF に達することを確認する
    let mut lexer = Lexer::new(b"42");
    assert_eq!(lexer.read_integer(), Some(42));
    assert_eq!(lexer.position(), 2);
    assert!(lexer.is_eof());
}

#[test]
fn read_integer_stops_at_lf() {
    // 後続が LF の '42\n' を Some(42) として読み peek が LF を指すことを確認する
    let mut lexer = Lexer::new(b"42\n");
    assert_eq!(lexer.read_integer(), Some(42));
    assert_eq!(lexer.position(), 2);
    assert_eq!(lexer.peek(), Some(b'\n'));
}

#[test]
fn read_integer_returns_none_for_digits_then_non_digit_regular() {
    // 数字途中で非数字 regular '123abc' を検出した場合 None・pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"123abc");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_signed_digits_then_non_digit_regular() {
    // 符号付き数字途中で非数字 regular '-12x' を検出した場合 None・pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"-12x");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 8-F: . 遭遇（実数候補 — 次タスクの read_real に渡すため巻き戻し）

#[test]
fn read_integer_returns_none_when_dot_after_digits() {
    // 数字後に '.' が続く '12.3' を None として返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"12.3");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_when_dot_at_trailing() {
    // 末尾が '.' の '4.' を None として返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"4.");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_when_leading_dot() {
    // 先頭が '.' の '.002' を None として返し pos が 0 のままであることを確認する（先頭バイト早期 None 経路）
    let mut lexer = Lexer::new(b".002");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_when_dot_after_sign_and_digits() {
    // 符号付き数字後に '.' が続く '-3.14' を None として返し pos が 0 に巻き戻されることを確認する
    let mut lexer = Lexer::new(b"-3.14");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 8-G: i64 境界（オーバーフロー検知）

#[test]
fn read_integer_reads_i64_max() {
    // i64::MAX (9223372036854775807) を Some(i64::MAX) として読み pos を 19 進めることを確認する
    let mut lexer = Lexer::new(b"9223372036854775807");
    assert_eq!(lexer.read_integer(), Some(i64::MAX));
    assert_eq!(lexer.position(), 19);
}

#[test]
fn read_integer_returns_none_for_i64_max_plus_one() {
    // i64::MAX + 1 (9223372036854775808) は checked_add でオーバーフローし None・pos 巻き戻しになることを確認する
    let mut lexer = Lexer::new(b"9223372036854775808");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_reads_i64_min() {
    // 符号付き累積により i64::MIN (-9223372036854775808) を Some(i64::MIN) として読めることを確認する
    let mut lexer = Lexer::new(b"-9223372036854775808");
    assert_eq!(lexer.read_integer(), Some(i64::MIN));
    assert_eq!(lexer.position(), 20);
}

#[test]
fn read_integer_returns_none_for_i64_min_minus_one() {
    // i64::MIN - 1 (-9223372036854775809) は checked_sub でオーバーフローし None・pos 巻き戻しになることを確認する
    let mut lexer = Lexer::new(b"-9223372036854775809");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_integer_returns_none_for_very_long_digits_overflow() {
    // i64 桁数を大幅に超える数字列は途中で checked_mul が None を返し巻き戻されることを確認する
    let mut lexer = Lexer::new(b"99999999999999999999999");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 8-H: pos 巻き戻し（中間位置 / 副作用検証）

#[test]
fn read_integer_at_mid_buffer_advances_correctly() {
    // 'x123 ' で先頭 'x' を advance 後 read_integer を呼び Some(123)・pos == 4・peek が ' ' を指すことを確認する
    let mut lexer = Lexer::new(b"x123 ");
    lexer.advance();
    assert_eq!(lexer.read_integer(), Some(123));
    assert_eq!(lexer.position(), 4);
    assert_eq!(lexer.peek(), Some(b' '));
}

#[test]
fn read_integer_failure_at_mid_buffer_rolls_back_to_call_site() {
    // 'x12.3' で先頭 'x' を advance 後（pos == 1）に read_integer を呼ぶと None かつ pos が 1（呼び出し前位置）に巻き戻ることを確認する
    let mut lexer = Lexer::new(b"x12.3");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 1);
}

// ---------- Phase 9: read_real ----------

// Phase 9-D: 整数部 + 小数部（N.M）

#[test]
fn read_real_reads_zero_dot_zero() {
    // '0.0' を Some(0.0) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"0.0");
    assert_eq!(lexer.read_real(), Some(0.0));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_real_reads_simple_real_34_5() {
    // '34.5' を Some(34.5) として読み pos を 4 進めることを確認する
    let mut lexer = Lexer::new(b"34.5");
    assert_eq!(lexer.read_real(), Some(34.5));
    assert_eq!(lexer.position(), 4);
}

// Phase 9-B: 整数部のみ実数（N.）

#[test]
fn read_real_reads_zero_dot() {
    // '0.' を Some(0.0) として読み pos を 2 進めることを確認する
    let mut lexer = Lexer::new(b"0.");
    assert_eq!(lexer.read_real(), Some(0.0));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_real_reads_four_dot() {
    // '4.' を Some(4.0) として読み pos を 2 進めることを確認する
    let mut lexer = Lexer::new(b"4.");
    assert_eq!(lexer.read_real(), Some(4.0));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_real_reads_multi_digit_int_dot() {
    // '123.' を Some(123.0) として読み pos を 4 進めることを確認する
    let mut lexer = Lexer::new(b"123.");
    assert_eq!(lexer.read_real(), Some(123.0));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_real_reads_leading_zeros_int_dot() {
    // '00042.' を Some(42.0) として読み pos を 6 進めることを確認する（先頭ゼロ許容）
    let mut lexer = Lexer::new(b"00042.");
    assert_eq!(lexer.read_real(), Some(42.0));
    assert_eq!(lexer.position(), 6);
}

// Phase 9-C: 小数部のみ実数（.N）

#[test]
fn read_real_reads_dot_zero() {
    // '.0' を Some(0.0) として読み pos を 2 進めることを確認する
    let mut lexer = Lexer::new(b".0");
    assert_eq!(lexer.read_real(), Some(0.0));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_real_reads_dot_five() {
    // '.5' を Some(0.5) として読み pos を 2 進めることを確認する
    let mut lexer = Lexer::new(b".5");
    assert_eq!(lexer.read_real(), Some(0.5));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_real_reads_dot_zero_one() {
    // '.01' を Some(0.01) 近傍として読み pos を 3 進めることを確認する（先頭ゼロ小数部スケーリング検証）
    let mut lexer = Lexer::new(b".01");
    let v = lexer.read_real().expect("expected Some(0.01)");
    assert!((v - 0.01).abs() < 1e-12, "expected ~0.01, got {v}");
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_real_reads_dot_zero_zero_two() {
    // '.002' を Some(0.002) 近傍として読み pos を 4 進めることを確認する
    let mut lexer = Lexer::new(b".002");
    let v = lexer.read_real().expect("expected Some(0.002)");
    assert!((v - 0.002).abs() < 1e-12, "expected ~0.002, got {v}");
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_real_reads_dot_trailing_zeros() {
    // '.5000' を Some(0.5) として読み pos を 5 進めることを確認する
    let mut lexer = Lexer::new(b".5000");
    assert_eq!(lexer.read_real(), Some(0.5));
    assert_eq!(lexer.position(), 5);
}

// Phase 9-D 続き: 整数部 + 小数部の他バリエーション

#[test]
fn read_real_reads_one_dot_zero() {
    // '1.0' を Some(1.0) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"1.0");
    assert_eq!(lexer.read_real(), Some(1.0));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_real_reads_123_456() {
    // '123.456' を Some(123.456) 近傍として読み pos を 7 進めることを確認する
    let mut lexer = Lexer::new(b"123.456");
    let v = lexer.read_real().expect("expected Some(123.456)");
    assert!((v - 123.456).abs() < 1e-9, "expected ~123.456, got {v}");
    assert_eq!(lexer.position(), 7);
}

#[test]
fn read_real_reads_int_with_trailing_zero_fraction() {
    // '7.00' を Some(7.0) として読み pos を 4 進めることを確認する
    let mut lexer = Lexer::new(b"7.00");
    assert_eq!(lexer.read_real(), Some(7.0));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_real_reads_zero_with_long_fraction() {
    // '0.000001' を Some(0.000001) 近傍として読み pos を 8 進めることを確認する
    let mut lexer = Lexer::new(b"0.000001");
    let v = lexer.read_real().expect("expected Some(0.000001)");
    assert!((v - 0.000001).abs() < 1e-12, "expected ~0.000001, got {v}");
    assert_eq!(lexer.position(), 8);
}

// Phase 9-E: 符号付き実数（±N.M / ±.M / ±N.）

#[test]
fn read_real_reads_plus_zero_dot_zero() {
    // '+0.0' を Some(0.0) として読み pos を 4 進めることを確認する
    let mut lexer = Lexer::new(b"+0.0");
    assert_eq!(lexer.read_real(), Some(0.0));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_real_reads_minus_zero_dot_zero() {
    // '-0.0' を Some(-0.0) として読み pos を 4 進めることを確認する（符号ビット保持）
    let mut lexer = Lexer::new(b"-0.0");
    let v = lexer.read_real().expect("expected Some(-0.0)");
    assert_eq!(v, -0.0);
    assert!(v.is_sign_negative(), "expected negative zero sign bit");
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_real_reads_plus_123_6() {
    // '+123.6' を Some(123.6) 近傍として読み pos を 6 進めることを確認する
    let mut lexer = Lexer::new(b"+123.6");
    let v = lexer.read_real().expect("expected Some(123.6)");
    assert!((v - 123.6).abs() < 1e-9, "expected ~123.6, got {v}");
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_real_reads_minus_3_62() {
    // '-3.62' を Some(-3.62) 近傍として読み pos を 5 進めることを確認する
    let mut lexer = Lexer::new(b"-3.62");
    let v = lexer.read_real().expect("expected Some(-3.62)");
    assert!((v - (-3.62)).abs() < 1e-9, "expected ~-3.62, got {v}");
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_real_reads_plus_dot_5() {
    // '+.5' を Some(0.5) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"+.5");
    assert_eq!(lexer.read_real(), Some(0.5));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_real_reads_minus_dot_002() {
    // '-.002' を Some(-0.002) 近傍として読み pos を 5 進めることを確認する
    let mut lexer = Lexer::new(b"-.002");
    let v = lexer.read_real().expect("expected Some(-0.002)");
    assert!((v - (-0.002)).abs() < 1e-12, "expected ~-0.002, got {v}");
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_real_reads_plus_4_dot() {
    // '+4.' を Some(4.0) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"+4.");
    assert_eq!(lexer.read_real(), Some(4.0));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_real_reads_minus_4_dot() {
    // '-4.' を Some(-4.0) として読み pos を 3 進めることを確認する
    let mut lexer = Lexer::new(b"-4.");
    assert_eq!(lexer.read_real(), Some(-4.0));
    assert_eq!(lexer.position(), 3);
}

// Phase 9-F: トークン境界（後続 ws/delim/EOF）

#[test]
fn read_real_stops_at_space() {
    // '34.5 rest' を Some(34.5)・pos 4 として読み peek が ' ' を指すことを確認する
    let mut lexer = Lexer::new(b"34.5 rest");
    assert_eq!(lexer.read_real(), Some(34.5));
    assert_eq!(lexer.position(), 4);
    assert_eq!(lexer.peek(), Some(b' '));
}

#[test]
fn read_real_stops_at_lf() {
    // '34.5\nrest' を Some(34.5)・pos 4 として読み peek が '\n' を指すことを確認する
    let mut lexer = Lexer::new(b"34.5\nrest");
    assert_eq!(lexer.read_real(), Some(34.5));
    assert_eq!(lexer.position(), 4);
    assert_eq!(lexer.peek(), Some(b'\n'));
}

#[test]
fn read_real_stops_at_cr() {
    // '34.5\rrest' を Some(34.5)・pos 4 として読み peek が '\r' を指すことを確認する
    let mut lexer = Lexer::new(b"34.5\rrest");
    assert_eq!(lexer.read_real(), Some(34.5));
    assert_eq!(lexer.position(), 4);
    assert_eq!(lexer.peek(), Some(b'\r'));
}

#[test]
fn read_real_stops_at_right_bracket() {
    // '5.7]rest' を Some(5.7) 近傍・pos 3 として読み peek が ']' を指すことを確認する
    let mut lexer = Lexer::new(b"5.7]rest");
    let v = lexer.read_real().expect("expected Some(5.7)");
    assert!((v - 5.7).abs() < 1e-12, "expected ~5.7, got {v}");
    assert_eq!(lexer.position(), 3);
    assert_eq!(lexer.peek(), Some(b']'));
}

#[test]
fn read_real_stops_at_eof() {
    // '5.7' 単独で Some(5.7) 近傍・pos 3 として読み EOF に達することを確認する
    let mut lexer = Lexer::new(b"5.7");
    let v = lexer.read_real().expect("expected Some(5.7)");
    assert!((v - 5.7).abs() < 1e-12, "expected ~5.7, got {v}");
    assert_eq!(lexer.position(), 3);
    assert!(lexer.is_eof());
}

#[test]
fn read_real_stops_at_every_trailing_whitespace_byte() {
    // '5.7' + whitespace 6 種の全組で Some(5.7) 近傍・pos 3 で停止することを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [b'5', b'.', b'7', w];
        let mut lexer = Lexer::new(&input);
        let v = lexer
            .read_real()
            .unwrap_or_else(|| panic!("whitespace 0x{w:02X} should yield Some(5.7)"));
        assert!(
            (v - 5.7).abs() < 1e-12,
            "whitespace 0x{w:02X} expected ~5.7, got {v}"
        );
        assert_eq!(lexer.position(), 3, "whitespace 0x{w:02X} should stop at 3");
    }
}

#[test]
fn read_real_stops_at_every_trailing_delimiter_byte() {
    // '5.7' + delimiter 10 種の全組で Some(5.7) 近傍・pos 3 で停止することを確認する
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for d in delimiter_bytes {
        let input = [b'5', b'.', b'7', d];
        let mut lexer = Lexer::new(&input);
        let v = lexer
            .read_real()
            .unwrap_or_else(|| panic!("delimiter 0x{d:02X} should yield Some(5.7)"));
        assert!(
            (v - 5.7).abs() < 1e-12,
            "delimiter 0x{d:02X} expected ~5.7, got {v}"
        );
        assert_eq!(lexer.position(), 3, "delimiter 0x{d:02X} should stop at 3");
    }
}

#[test]
fn read_real_stops_at_trailing_whitespace_after_int_dot() {
    // '4. rest' を Some(4.0)・pos 2 として読むことを確認する
    let mut lexer = Lexer::new(b"4. rest");
    assert_eq!(lexer.read_real(), Some(4.0));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_real_stops_at_trailing_delimiter_after_dot_frac() {
    // '.5]rest' を Some(0.5)・pos 2 として読むことを確認する
    let mut lexer = Lexer::new(b".5]rest");
    assert_eq!(lexer.read_real(), Some(0.5));
    assert_eq!(lexer.position(), 2);
}

// Phase 9-A: 早期 None（先頭バイト不適合）

#[test]
fn read_real_returns_none_for_empty_input() {
    // 空入力で None・pos 0 のままを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_at_eof() {
    // EOF 状態で None・pos 不変を確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_real_returns_none_for_non_digit_non_dot_non_sign_regular_byte() {
    // 先頭が 'x' / 'a' / 'A' 等の regular byte で None・pos 0 を確認する
    for byte in [b'x', b'a', b'A'] {
        let input = [byte, b'1', b'2'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_real(),
            None,
            "leading regular byte 0x{byte:02X} should yield None"
        );
        assert_eq!(
            lexer.position(),
            0,
            "leading regular byte 0x{byte:02X} should keep pos 0"
        );
    }
}

#[test]
fn read_real_returns_none_for_lone_plus_at_eof() {
    // '+' 1 バイトのみで None・pos 0 を確認する
    let mut lexer = Lexer::new(b"+");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_lone_minus_at_eof() {
    // '-' 1 バイトのみで None・pos 0 を確認する
    let mut lexer = Lexer::new(b"-");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_lone_dot_at_eof() {
    // '.' 1 バイトのみで None・pos 0 を確認する（数字無しの '.' 単独は実数ではない）
    let mut lexer = Lexer::new(b".");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_plus_dot_eof() {
    // '+.' で None・pos 0 を確認する（直後に数字なし）
    let mut lexer = Lexer::new(b"+.");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_minus_dot_eof() {
    // '-.' で None・pos 0 を確認する（直後に数字なし）
    let mut lexer = Lexer::new(b"-.");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_every_leading_whitespace_byte() {
    // 仕様 §2.1 の whitespace 6 バイト全てを先頭に置いた場合、各々 None・pos 0 を確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [w, b'1', b'.', b'2'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_real(),
            None,
            "whitespace 0x{w:02X} should yield None"
        );
        assert_eq!(
            lexer.position(),
            0,
            "whitespace 0x{w:02X} should keep pos 0"
        );
    }
}

#[test]
fn read_real_returns_none_for_every_leading_delimiter_byte() {
    // 仕様 §2.2 の delimiter 10 バイト全てを先頭に置いた場合、各々 None・pos 0 を確認する
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for d in delimiter_bytes {
        let input = [d, b'1', b'.', b'2'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_real(),
            None,
            "delimiter 0x{d:02X} should yield None"
        );
        assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
    }
}

#[test]
fn read_real_returns_none_for_sign_then_every_whitespace_byte() {
    // 符号 ∈ {+, -} × whitespace 6 種の全 12 組で None・pos 0 を確認する
    let signs = [b'+', b'-'];
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for s in signs {
        for w in whitespace_bytes {
            let input = [s, w];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_real(),
                None,
                "sign 0x{s:02X} + whitespace 0x{w:02X} should yield None"
            );
            assert_eq!(
                lexer.position(),
                0,
                "sign 0x{s:02X} + whitespace 0x{w:02X} should rollback to 0"
            );
        }
    }
}

#[test]
fn read_real_returns_none_for_sign_then_every_delimiter_byte() {
    // 符号 ∈ {+, -} × delimiter 10 種の全 20 組で None・pos 0 を確認する
    let signs = [b'+', b'-'];
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for s in signs {
        for d in delimiter_bytes {
            let input = [s, d];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_real(),
                None,
                "sign 0x{s:02X} + delimiter 0x{d:02X} should yield None"
            );
            assert_eq!(
                lexer.position(),
                0,
                "sign 0x{s:02X} + delimiter 0x{d:02X} should rollback to 0"
            );
        }
    }
}

// Phase 9-G: 指数表記の拒否 + 複数小数点拒否 + '.' 不在拒否

#[test]
fn read_real_returns_none_for_exponent_lowercase_e() {
    // '1.2e3' は指数表記として拒否（ISO 32000-1 仕様外）。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1.2e3");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_exponent_uppercase_e() {
    // '1.2E3' は指数表記として拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1.2E3");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_exponent_int_only() {
    // '1e2' は整数部のみ + 指数で拒否（'.' 不在 + 指数）。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1e2");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_dot_frac_then_exponent() {
    // '.5e3' は小数部側 + 指数で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b".5e3");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_int_dot_then_exponent() {
    // '1.e3' は末尾ドット + 指数で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1.e3");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_two_dots_consecutive() {
    // '..' は 2 個目の '.' で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"..");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_int_two_dots() {
    // '1..2' は 2 個目の '.' で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1..2");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_two_dots_in_real() {
    // '1.2.3' は 2 個目の '.' で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1.2.3");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_real_with_letters() {
    // '1.2abc' は数字途中で非数字 regular byte 'a' を検出し拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"1.2abc");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_signed_with_letters() {
    // '-12x' は数字 '12' の後に非数字 'x' が続き '.' を含まないため実数として不正。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"-12x");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_unsigned_integer_only() {
    // '123' は '.' を含まない整数のみ入力で拒否（read_integer 責務）。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"123");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_single_digit_only() {
    // '0' 単独は '.' 不在で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"0");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_plus_integer_only() {
    // '+45' は '.' 不在で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"+45");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_minus_integer_only() {
    // '-7' は '.' 不在で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"-7");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_leading_zeros_integer_only() {
    // '00042' は '.' 不在で拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"00042");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_integer_followed_by_whitespace() {
    // '123 rest' は ws までで '.' 不在のため拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"123 rest");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_real_returns_none_for_integer_followed_by_delimiter() {
    // '42]rest' は delim までで '.' 不在のため拒否。None・pos 0 を確認する
    let mut lexer = Lexer::new(b"42]rest");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 9-H: IEEE 754 関連（±0.0 の符号保持）

#[test]
fn read_real_preserves_negative_zero_sign_bit() {
    // '-0.0' の戻り値は f64::is_sign_negative == true（負ゼロ符号ビット保持）
    let mut lexer = Lexer::new(b"-0.0");
    let v = lexer.read_real().expect("expected Some(-0.0)");
    assert!(v.is_sign_negative(), "expected negative zero sign bit");
}

#[test]
fn read_real_preserves_positive_zero_sign_bit() {
    // '+0.0' の戻り値は f64::is_sign_negative == false（正ゼロ）
    let mut lexer = Lexer::new(b"+0.0");
    let v = lexer.read_real().expect("expected Some(0.0)");
    assert!(!v.is_sign_negative(), "expected positive zero sign bit");
}

#[test]
fn read_real_unsigned_zero_is_positive_zero() {
    // '0.0' は符号無しなので f64::is_sign_negative == false（正ゼロ）
    let mut lexer = Lexer::new(b"0.0");
    let v = lexer.read_real().expect("expected Some(0.0)");
    assert!(!v.is_sign_negative(), "expected positive zero sign bit");
}

#[test]
fn read_real_always_returns_finite_value() {
    // 受理形すべてで戻り値が is_finite() == true であることを確認する
    let inputs: &[&[u8]] = &[
        b"0.0",
        b"34.5",
        b"+0.0",
        b"-0.0",
        b"123.456",
        b"-3.62",
        b".5",
        b"-.002",
        b"4.",
        b"+4.",
        b"0.000001",
    ];
    for input in inputs {
        let mut lexer = Lexer::new(input);
        let v = lexer
            .read_real()
            .unwrap_or_else(|| panic!("input {input:?} should yield Some"));
        assert!(
            v.is_finite(),
            "input {input:?} should yield finite value, got {v}"
        );
    }
}

// Phase 9-I: pos 巻き戻し（中間位置 / 部分失敗ロールバック）

#[test]
fn read_real_succeeds_at_mid_buffer_and_advances_pos_correctly() {
    // 'x1.2' で 'x' を advance 後（pos == 1）に read_real を呼び Some(1.2) 近傍・pos == 4 を確認する
    let mut lexer = Lexer::new(b"x1.2");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    let v = lexer.read_real().expect("expected Some(1.2)");
    assert!((v - 1.2).abs() < 1e-12, "expected ~1.2, got {v}");
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_real_failure_at_mid_buffer_with_invalid_input_rolls_back() {
    // 'x1.2.3' で 'x' を advance 後（pos == 1）に read_real を呼ぶと None・pos が呼び出し前位置 1 に厳密復元されることを確認する
    let mut lexer = Lexer::new(b"x1.2.3");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_real_partial_consume_then_reject_rolls_back() {
    // 'x1.2e3' で 'x' を advance 後（pos == 1）に呼び出し、1.2 まで読んだ後 'e' で拒否されて pos が呼び出し前位置 1 に厳密復元されることを確認する
    let mut lexer = Lexer::new(b"x1.2e3");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_real_sign_then_invalid_rolls_back_to_start() {
    // '+x' は '+' 消費後に 'x' で拒否。pos が 0 に巻き戻ることを確認する
    let mut lexer = Lexer::new(b"+x");
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 9-J: 大桁数（精度劣化を許容しつつ panic 不在 + 有限値）

#[test]
fn read_real_handles_long_integer_part_without_panic() {
    // 整数部 50 桁（'9' x 50 + '.0'）で panic せず Some(有限値) を返し pos が入力末尾に進むことを確認する
    let mut input = vec![b'9'; 50];
    input.extend_from_slice(b".0");
    let mut lexer = Lexer::new(&input);
    let v = lexer.read_real().expect("expected Some for 50-digit int");
    assert!(v.is_finite(), "expected finite, got {v}");
    assert_eq!(
        lexer.position(),
        input.len(),
        "expected pos to reach end of input"
    );
}

#[test]
fn read_real_handles_long_fractional_part_without_panic() {
    // 小数部 50 桁（'0.' + '0' x 49 + '1'）で panic せず Some(有限値) を返し pos が入力末尾に進むことを確認する
    let mut input = vec![b'0', b'.'];
    input.extend(std::iter::repeat_n(b'0', 49));
    input.push(b'1');
    let mut lexer = Lexer::new(&input);
    let v = lexer.read_real().expect("expected Some for 50-digit frac");
    assert!(v.is_finite(), "expected finite, got {v}");
    assert_eq!(
        lexer.position(),
        input.len(),
        "expected pos to reach end of input"
    );
}

#[test]
fn read_real_handles_very_long_input_without_panic() {
    // 整数部 100 桁 + 小数部 100 桁で panic せず Some(有限値) を返し pos が入力末尾に進むことを確認する
    let mut input = vec![b'9'; 100];
    input.push(b'.');
    input.extend(std::iter::repeat_n(b'1', 100));
    let mut lexer = Lexer::new(&input);
    let v = lexer
        .read_real()
        .expect("expected Some for 100+100 digit real");
    assert!(v.is_finite(), "expected finite, got {v}");
    assert_eq!(
        lexer.position(),
        input.len(),
        "expected pos to reach end of input"
    );
}

#[test]
fn read_real_rejects_infinity_saturated_input() {
    // 整数部 400 桁 + '.0' は f64 が Inf に飽和するため None・pos 0 に巻き戻されることを確認する
    let mut input = vec![b'9'; 400];
    input.extend_from_slice(b".0");
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_real(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 9-K: 結合テスト（dispatcher パターン契約）

#[test]
fn read_integer_then_read_real_dispatcher_pattern_for_real() {
    // '5.7' に対し read_integer() が None && pos == 0 で巻き戻し、続けて read_real() が Some(5.7) 近傍 + pos == 3 となる対称契約を確認する
    let mut lexer = Lexer::new(b"5.7");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
    let v = lexer.read_real().expect("expected Some(5.7)");
    assert!((v - 5.7).abs() < 1e-12, "expected ~5.7, got {v}");
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_integer_then_read_real_dispatcher_pattern_for_signed_real() {
    // '-.002' に対し read_integer() が None && pos == 0、続けて read_real() が Some(-0.002) 近傍 + pos == 5 となる契約を確認する
    let mut lexer = Lexer::new(b"-.002");
    assert_eq!(lexer.read_integer(), None);
    assert_eq!(lexer.position(), 0);
    let v = lexer.read_real().expect("expected Some(-0.002)");
    assert!((v - (-0.002)).abs() < 1e-12, "expected ~-0.002, got {v}");
    assert_eq!(lexer.position(), 5);
}

// ---------- Phase 10: read_name ----------

// Phase 10-A: 早期 None（先頭バイトが '/' でない / EOF / 空）

#[test]
fn read_name_returns_none_for_empty_input() {
    // 空入力で read_name が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_returns_none_at_eof() {
    // EOF 状態の read_name が None を返し pos 不変であることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_name_returns_none_for_non_slash_leading_byte() {
    // 先頭が '/' でない 'abc' で None を返し pos 0 のままであることを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_returns_none_for_every_leading_whitespace_byte() {
    // 仕様 §2.1 の whitespace 6 バイトを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [w, b'T', b'y', b'p', b'e'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            None,
            "whitespace 0x{w:02X} should yield None"
        );
        assert_eq!(
            lexer.position(),
            0,
            "whitespace 0x{w:02X} should keep pos 0"
        );
    }
}

#[test]
fn read_name_returns_none_for_every_leading_delimiter_byte() {
    // 仕様 §2.2 の delimiter のうち '/' 以外 9 バイトを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
    // ('/' は 10-F で空名前として別途検証)
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x25];
    for d in delimiter_bytes {
        let input = [d, b'T', b'y', b'p', b'e'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            None,
            "delimiter 0x{d:02X} should yield None"
        );
        assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
    }
}

// Phase 10-B: 基本 ASCII 名前

#[test]
fn read_name_reads_simple_ascii_name() {
    // '/Type' (EOF 終端) で Some(b"Type")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/Type");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_reads_subtype_name() {
    // 桁数の三角測量: '/Subtype' で Some(b"Subtype")・pos == 8 を確認する
    let mut lexer = Lexer::new(b"/Subtype");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Subtype".to_vec())));
    assert_eq!(lexer.position(), 8);
}

#[test]
fn read_name_reads_single_letter_name() {
    // 三角測量: '/A' 単一文字で Some(b"A")・pos == 2 を確認する
    let mut lexer = Lexer::new(b"/A");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A".to_vec())));
    assert_eq!(lexer.position(), 2);
}

// Phase 10-C: #XX エスケープ単発

#[test]
fn read_name_decodes_uppercase_hex_escape() {
    // '/A#42' (#42='B') で Some(b"AB")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/A#42");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"AB".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_decodes_lowercase_hex_escape() {
    // '/a#ff' (#ff=0xFF) で Some(b"a\xFF")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/a#ff");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"a\xFF".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_decodes_mixed_case_hex_escape() {
    // '/a#fF' 大小混在で Some(b"a\xFF")・pos == 5 を確認する
    let mut lexer = Lexer::new(b"/a#fF");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"a\xFF".to_vec())));
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_name_decodes_whitespace_byte_via_escape() {
    // '/Hello#20World' (#20=space) で Some(b"Hello World")・pos == 14 を確認する（境界判定は生バイトのみ）
    let mut lexer = Lexer::new(b"/Hello#20World");
    assert_eq!(
        lexer.read_name(),
        Some(PdfName::new(b"Hello World".to_vec()))
    );
    assert_eq!(lexer.position(), 14);
}

#[test]
fn read_name_decodes_delimiter_byte_via_escape() {
    // '/A#28B' (#28='(') で Some(b"A(B")・pos == 6 を確認する
    let mut lexer = Lexer::new(b"/A#28B");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A(B".to_vec())));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_name_decodes_nul_byte_via_escape() {
    // '/A#00B' (#00=NUL) で Some(b"A\x00B")・pos == 6 を確認する（任意バイト 0x00 受理）
    let mut lexer = Lexer::new(b"/A#00B");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"A\x00B".to_vec())));
    assert_eq!(lexer.position(), 6);
}

// Phase 10-D: #XX エスケープ複数

#[test]
fn read_name_decodes_consecutive_escapes() {
    // '/paired#28#29parentheses' で連続エスケープを復号し Some(b"paired()parentheses")・pos == 24 を確認する
    let mut lexer = Lexer::new(b"/paired#28#29parentheses");
    assert_eq!(
        lexer.read_name(),
        Some(PdfName::new(b"paired()parentheses".to_vec()))
    );
    assert_eq!(lexer.position(), 24);
}

#[test]
fn read_name_decodes_escape_then_regular_then_escape() {
    // '/A#42C#43' (#42='B', #43='C') で Some(b"ABCC")・pos == 9 を確認する
    let mut lexer = Lexer::new(b"/A#42C#43");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"ABCC".to_vec())));
    assert_eq!(lexer.position(), 9);
}

// Phase 10-E: 終端境界

#[test]
fn read_name_stops_at_every_trailing_whitespace_byte() {
    // '/Type' + whitespace 6 種の全組で Some(b"Type")・pos == 5 で停止することを確認する
    let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for w in whitespace_bytes {
        let input = [b'/', b'T', b'y', b'p', b'e', w];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            Some(PdfName::new(b"Type".to_vec())),
            "whitespace 0x{w:02X} should yield Some(b\"Type\")"
        );
        assert_eq!(lexer.position(), 5, "whitespace 0x{w:02X} should stop at 5");
    }
}

#[test]
fn read_name_stops_at_every_trailing_delimiter_byte() {
    // '/Type' + delimiter 10 種の全組で Some(b"Type")・pos == 5 で停止することを確認する
    let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for d in delimiter_bytes {
        let input = [b'/', b'T', b'y', b'p', b'e', d];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_name(),
            Some(PdfName::new(b"Type".to_vec())),
            "delimiter 0x{d:02X} should yield Some(b\"Type\")"
        );
        assert_eq!(lexer.position(), 5, "delimiter 0x{d:02X} should stop at 5");
    }
}

#[test]
fn read_name_stops_at_eof() {
    // '/Type' (EOF 終端) で Some(b"Type")・pos == 5・is_eof() を確認する
    let mut lexer = Lexer::new(b"/Type");
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
    assert_eq!(lexer.position(), 5);
    assert!(lexer.is_eof());
}

// Phase 10-F: 空名前 '/'

#[test]
fn read_name_returns_empty_name_at_eof() {
    // '/' 単独で Some(b"")・pos == 1・is_eof() を確認する（空名前受理）
    let mut lexer = Lexer::new(b"/");
    assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
    assert_eq!(lexer.position(), 1);
    assert!(lexer.is_eof());
}

#[test]
fn read_name_returns_empty_name_before_whitespace() {
    // '/ rest' で Some(b"")・pos == 1 を確認する
    let mut lexer = Lexer::new(b"/ rest");
    assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_name_returns_empty_name_before_delimiter() {
    // '/[' で Some(b"")・pos == 1 を確認する
    let mut lexer = Lexer::new(b"/[");
    assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
    assert_eq!(lexer.position(), 1);
}

// Phase 10-G: 不正 #XX エスケープ（巻き戻し検証）

#[test]
fn read_name_rejects_hash_at_eof() {
    // '/A#' (# のあと EOF) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_one_hex_then_eof() {
    // '/A#1' (#1 のあと EOF) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#1");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_non_hex_high() {
    // '/A#Z' (高位が非16進) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#Z");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_non_hex_low() {
    // '/A#1Z' (低位が非16進) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#1Z");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_whitespace_low() {
    // '/A#1 ' (低位が space) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#1 ");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_delimiter_low() {
    // '/A#1/' (低位が '/') で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#1/");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_nul_low() {
    // '/A#1\0' (低位が NUL = is_ascii_hexdigit false) で None・pos == 0 巻き戻しを確認する
    let input = [b'/', b'A', b'#', b'1', 0x00];
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_whitespace_high() {
    // '/A# ' (高位が space = is_ascii_hexdigit false) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A# ");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_delimiter_high() {
    // '/A#/' (高位が '/' = is_ascii_hexdigit false) で None・pos == 0 巻き戻しを確認する
    let mut lexer = Lexer::new(b"/A#/");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_name_rejects_hash_with_non_hex_high_and_low() {
    // '/A#GG' (高位・低位とも非16進) で None・pos == 0 巻き戻しを確認する（TS readName バグの代表入力）
    let mut lexer = Lexer::new(b"/A#GG");
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 0);
}

// Phase 10-H: 長名前（仕様推奨上限 127 バイトを超えても受理）

#[test]
fn read_name_accepts_200_byte_ascii_name() {
    // '/' + 'A' × 200 で Some([b'A'; 200])・pos == 201 を確認する（推奨上限非強制）
    let mut input = Vec::with_capacity(201);
    input.push(b'/');
    input.extend(std::iter::repeat_n(b'A', 200));
    let mut lexer = Lexer::new(&input);
    assert_eq!(lexer.read_name(), Some(PdfName::new([b'A'; 200].to_vec())));
    assert_eq!(lexer.position(), 201);
}

// Phase 10-I: 中間位置呼び出し（advance 後の起点）

#[test]
fn read_name_at_mid_buffer_succeeds_after_advance() {
    // 'x/Type ' で advance 後 (pos == 1) に呼び Some(b"Type")・pos == 6 を確認する
    let mut lexer = Lexer::new(b"x/Type ");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_name_failure_at_mid_buffer_rolls_back_to_call_site() {
    // 'xabc' で advance 後 (pos == 1) に呼び None・pos == 1 巻き戻しを確認する
    let mut lexer = Lexer::new(b"xabc");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_name_invalid_escape_at_mid_buffer_rolls_back_to_call_site() {
    // 'x/A#' で advance 後 (pos == 1) に不正エスケープ → pos == 1 巻き戻しを確認する
    let mut lexer = Lexer::new(b"x/A#");
    lexer.advance();
    assert_eq!(lexer.position(), 1);
    assert_eq!(lexer.read_name(), None);
    assert_eq!(lexer.position(), 1);
}

// ---------- Phase A: read_array_begin / read_array_end ----------

#[test]
fn read_array_begin_returns_none_for_empty_input() {
    // 空入力に対する read_array_begin が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_array_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_begin_returns_none_for_non_bracket_byte() {
    // 先頭バイトが `[` でない `(` を入力すると None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"(abc");
    assert_eq!(lexer.read_array_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_begin_returns_none_at_eof() {
    // EOF 状態の read_array_begin が None を返し pos が EOF 位置のままであることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_array_begin(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_begin_reads_bracket() {
    // `[` 単独入力で Some(Token::ArrayBegin) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"[");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_begin_reads_bracket_followed_by_digit() {
    // `[123` のように regular byte が直接続いても pos == 1 で停止することを確認する
    let mut lexer = Lexer::new(b"[123");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_begin_reads_bracket_followed_by_whitespace() {
    // `[ ` のように whitespace が続いても pos == 1 で停止することを確認する
    let mut lexer = Lexer::new(b"[ ");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_end_returns_none_for_empty_input() {
    // 空入力に対する read_array_end が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_array_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_end_returns_none_for_non_bracket_byte() {
    // 先頭バイトが `]` でない `}` を入力すると None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"}abc");
    assert_eq!(lexer.read_array_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_array_end_reads_close_bracket_followed_by_eof() {
    // `]` 1 バイトのみで入力終端の場合、Some(ArrayEnd) / pos == 1 / is_eof を確認する
    let mut lexer = Lexer::new(b"]");
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
    assert!(lexer.is_eof());
}

#[test]
fn read_array_end_reads_close_bracket_followed_by_delimiter() {
    // `]>>` のように別 delimiter が続いても pos == 1 で停止することを確認する
    let mut lexer = Lexer::new(b"]>>");
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_array_apis_handle_nested_pattern_with_position_advance() {
    // `[[]]` を 4 回呼び出すと ArrayBegin / ArrayBegin / ArrayEnd / ArrayEnd が順に返り pos == 4 になることを確認する
    let mut lexer = Lexer::new(b"[[]]");
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.read_array_begin(), Some(Token::ArrayBegin));
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.read_array_end(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 4);
}

// ---------- Phase B: read_dict_begin / read_dict_end ----------

#[test]
fn read_dict_begin_returns_none_for_empty_input() {
    // 空入力に対する read_dict_begin が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_single_less_than() {
    // `<` 単独で次バイトが無い場合に None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"<");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_less_than_plus_hex_digit() {
    // `<a` のように 16 進開始を示す入力では None / pos 不変であることを確認する（read_hex_string の責務範囲）
    let mut lexer = Lexer::new(b"<a");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_less_than_plus_gt() {
    // `<>` （空 16 進文字列）でも `<<` 不一致のため None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b"<>");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_begin_returns_none_for_less_than_at_eof() {
    // `<` 1 バイトのみで EOF の場合に None / pos 不変 / is_eof は false（pos == 0 で input.len() == 1 のため）であることを確認する
    let mut lexer = Lexer::new(b"<");
    assert_eq!(lexer.read_dict_begin(), None);
    assert_eq!(lexer.position(), 0);
    assert!(!lexer.is_eof());
}

#[test]
fn read_dict_begin_reads_double_less_than_followed_by_name() {
    // `<</Type` のように 名前が続いても pos == 2 で停止することを確認する
    let mut lexer = Lexer::new(b"<</Type");
    assert_eq!(lexer.read_dict_begin(), Some(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_dict_begin_reads_double_less_than_followed_by_eof() {
    // `<<` 2 バイトのみで EOF の場合 Some(DictBegin) / pos == 2 / is_eof を確認する
    let mut lexer = Lexer::new(b"<<");
    assert_eq!(lexer.read_dict_begin(), Some(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
    assert!(lexer.is_eof());
}

#[test]
fn read_dict_end_returns_none_for_empty_input() {
    // 空入力に対する read_dict_end が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_end_returns_none_for_single_greater_than() {
    // `>` 単独で次バイトが無い場合に None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_end_returns_none_for_greater_than_plus_other() {
    // `>x` のように 2 バイト目が `>` でない場合に None / pos 不変であることを確認する
    let mut lexer = Lexer::new(b">x");
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_dict_end_returns_none_for_greater_than_at_eof() {
    // `>` 1 バイトのみで EOF の場合に None / pos 不変 / is_eof は false（pos == 0 で input.len() == 1 のため）であることを確認する
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.read_dict_end(), None);
    assert_eq!(lexer.position(), 0);
    assert!(!lexer.is_eof());
}

#[test]
fn read_dict_end_reads_double_greater_than_followed_by_whitespace() {
    // `>>\n` のように whitespace が続いても pos == 2 で停止することを確認する
    let mut lexer = Lexer::new(b">>\n");
    assert_eq!(lexer.read_dict_end(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn read_dict_end_reads_double_greater_than_followed_by_eof() {
    // `>>` 2 バイトのみで EOF の場合 Some(DictEnd) / pos == 2 / is_eof を確認する
    let mut lexer = Lexer::new(b">>");
    assert_eq!(lexer.read_dict_end(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
    assert!(lexer.is_eof());
}

#[test]
fn read_dict_apis_handle_empty_dict_pattern() {
    // `<<>>` を 2 回呼び出すと DictBegin / DictEnd が順に返り pos == 4 になることを確認する
    let mut lexer = Lexer::new(b"<<>>");
    assert_eq!(lexer.read_dict_begin(), Some(Token::DictBegin));
    assert_eq!(lexer.read_dict_end(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 4);
}

// ---------- Phase C: read_keyword の Primitive マッピング ----------

#[test]
fn read_keyword_maps_true_to_primitive_boolean_true() {
    // `true` 単独入力で Some(Primitive(Boolean(true))) を返し pos == 4 になることを確認する
    let mut lexer = Lexer::new(b"true");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(true)))
    );
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_maps_false_to_primitive_boolean_false() {
    // `false` 単独入力で Some(Primitive(Boolean(false))) を返し pos == 5 になることを確認する
    let mut lexer = Lexer::new(b"false");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(false)))
    );
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_keyword_distinguishes_true_and_false() {
    // true と false のマッピング結果が同じ Primitive::Boolean 内でも非等価であることを確認する
    let mut lexer_t = Lexer::new(b"true");
    let mut lexer_f = Lexer::new(b"false");
    assert_ne!(lexer_t.read_keyword(), lexer_f.read_keyword());
}

#[test]
fn read_keyword_maps_true_followed_by_whitespace() {
    // `true ` のように whitespace が続いても pos == 4 で停止し Boolean(true) を返すことを確認する
    let mut lexer = Lexer::new(b"true ");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(true)))
    );
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_maps_false_followed_by_delimiter() {
    // `false]` のように delimiter が続いても pos == 5 で停止し Boolean(false) を返すことを確認する
    let mut lexer = Lexer::new(b"false]");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Boolean(false)))
    );
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_keyword_maps_null_followed_by_eof() {
    // `null` で入力終端の場合 Some(Primitive(Null)) / pos == 4 / is_eof を確認する
    let mut lexer = Lexer::new(b"null");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Null))
    );
    assert_eq!(lexer.position(), 4);
    assert!(lexer.is_eof());
}

#[test]
fn read_keyword_maps_null_followed_by_slash() {
    // `null/Type` のように / delimiter が続いても pos == 4 で停止し Null を返すことを確認する
    let mut lexer = Lexer::new(b"null/Type");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Primitive(Primitive::Null))
    );
    assert_eq!(lexer.position(), 4);
}

// ---------- Phase D: read_keyword の構造制御マッピング ----------

#[test]
fn read_keyword_maps_stream_to_stream_begin() {
    // `stream` 単独入力で Some(Token::StreamBegin) を返し pos == 6 になることを確認する
    let mut lexer = Lexer::new(b"stream");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamBegin));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_keyword_maps_endstream_to_stream_end() {
    // `endstream` 単独入力で Some(Token::StreamEnd) を返し pos == 9 になることを確認する
    let mut lexer = Lexer::new(b"endstream");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamEnd));
    assert_eq!(lexer.position(), 9);
}

#[test]
fn read_keyword_distinguishes_obj_and_endobj() {
    // obj と endobj の桁違いマッピングが別バリアント（ObjBegin ≠ ObjEnd）であることを確認する
    let mut lexer_obj = Lexer::new(b"obj");
    let mut lexer_endobj = Lexer::new(b"endobj");
    assert_ne!(lexer_obj.read_keyword(), lexer_endobj.read_keyword());
}

#[test]
fn read_keyword_distinguishes_stream_and_endstream() {
    // stream と endstream の桁違いマッピングが別バリアント（StreamBegin ≠ StreamEnd）であることを確認する
    let mut lexer_s = Lexer::new(b"stream");
    let mut lexer_es = Lexer::new(b"endstream");
    assert_ne!(lexer_s.read_keyword(), lexer_es.read_keyword());
}

#[test]
fn read_keyword_maps_obj_followed_by_whitespace() {
    // `obj\n` のように LF が続いても pos == 3 で停止し ObjBegin を返すことを確認する
    let mut lexer = Lexer::new(b"obj\n");
    assert_eq!(lexer.read_keyword(), Some(Token::ObjBegin));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_keyword_maps_endobj_followed_by_eof() {
    // `endobj` で入力終端の場合 Some(ObjEnd) / pos == 6 / is_eof を確認する
    let mut lexer = Lexer::new(b"endobj");
    assert_eq!(lexer.read_keyword(), Some(Token::ObjEnd));
    assert_eq!(lexer.position(), 6);
    assert!(lexer.is_eof());
}

#[test]
fn read_keyword_maps_stream_followed_by_lf() {
    // `stream\n` のように LF が続いても pos == 6 で停止し StreamBegin を返すことを確認する（stream データ本体は本層スコープ外）
    let mut lexer = Lexer::new(b"stream\n");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamBegin));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_keyword_maps_endstream_followed_by_endobj() {
    // `endstream\nendobj` の最初の呼び出しで Some(StreamEnd) / pos == 9 を確認する
    let mut lexer = Lexer::new(b"endstream\nendobj");
    assert_eq!(lexer.read_keyword(), Some(Token::StreamEnd));
    assert_eq!(lexer.position(), 9);
}

// ---------- Phase E: read_keyword の未知キーワード平坦化 ----------

#[test]
fn read_keyword_flattens_uppercase_true_to_keyword() {
    // 大文字始まり `True` は case-sensitive により Boolean ではなく Keyword(b"True") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"True");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"True".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_flattens_uppercase_false_to_keyword() {
    // 全大文字 `FALSE` は case-sensitive により Boolean ではなく Keyword(b"FALSE") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"FALSE");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"FALSE".to_vec()))
    );
    assert_eq!(lexer.position(), 5);
}

#[test]
fn read_keyword_flattens_uppercase_null_to_keyword() {
    // 大文字始まり `Null` は case-sensitive により Null ではなく Keyword(b"Null") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"Null");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"Null".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_flattens_uppercase_obj_to_keyword() {
    // 全大文字 `OBJ` は case-sensitive により ObjBegin ではなく Keyword(b"OBJ") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"OBJ");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"OBJ".to_vec())));
    assert_eq!(lexer.position(), 3);
}

#[test]
fn read_keyword_flattens_uppercase_stream_to_keyword() {
    // 大文字始まり `Stream` は case-sensitive により StreamBegin ではなく Keyword(b"Stream") へ平坦化されることを確認する
    let mut lexer = Lexer::new(b"Stream");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"Stream".to_vec()))
    );
    assert_eq!(lexer.position(), 6);
}

#[test]
fn read_keyword_flattens_indirect_ref_marker_r() {
    // `R` 単独は間接参照マーカだが Lexer 層では Keyword(b"R") へ平坦化されることを確認する（組み立ては parser の責務）
    let mut lexer = Lexer::new(b"R");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"R".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_flattens_xref_keyword() {
    // `xref` キーワードが Keyword(b"xref") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"xref");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"xref".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn read_keyword_flattens_trailer_keyword() {
    // `trailer` キーワードが Keyword(b"trailer") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"trailer");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"trailer".to_vec()))
    );
    assert_eq!(lexer.position(), 7);
}

#[test]
fn read_keyword_flattens_startxref_keyword() {
    // `startxref` キーワードが Keyword(b"startxref") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"startxref");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"startxref".to_vec()))
    );
    assert_eq!(lexer.position(), 9);
}

#[test]
fn read_keyword_flattens_xref_entry_f_keyword() {
    // xref エントリ末尾 `f` 単独が Keyword(b"f") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"f");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"f".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_flattens_xref_entry_n_keyword() {
    // xref エントリ末尾 `n` 単独が Keyword(b"n") として平坦化されることを確認する
    let mut lexer = Lexer::new(b"n");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"n".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_flattens_true_x_as_single_keyword() {
    // `trueX` のように true キーワードに regular byte が連結された字句は分割せず Keyword(b"trueX") として吸収されることを確認する
    let mut lexer = Lexer::new(b"trueX");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"trueX".to_vec()))
    );
    assert_eq!(lexer.position(), 5);
}

// ---------- Phase F: read_keyword の境界条件 ----------

#[test]
fn read_keyword_returns_none_for_empty_input() {
    // 空入力に対する read_keyword が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.read_keyword(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_keyword_returns_none_at_eof() {
    // EOF 状態の read_keyword が None を返し pos が EOF 位置のままであることを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.read_keyword(), None);
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_returns_none_for_every_leading_whitespace_byte() {
    // ISO 32000 whitespace 6 種を先頭に置くと read_keyword が None / pos 不変であることを総当たりで確認する
    let whitespaces: [u8; 6] = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for ws in whitespaces {
        let input = [ws, b'X'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_keyword(), None, "whitespace byte = {:#x}", ws);
        assert_eq!(lexer.position(), 0, "whitespace byte = {:#x}", ws);
    }
}

#[test]
fn read_keyword_returns_none_for_every_leading_delimiter_byte() {
    // ISO 32000 delimiter 10 種を先頭に置くと read_keyword が None / pos 不変であることを総当たりで確認する
    let delimiters: [u8; 10] = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for delim in delimiters {
        let input = [delim, b'X'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_keyword(), None, "delimiter byte = {:#x}", delim);
        assert_eq!(lexer.position(), 0, "delimiter byte = {:#x}", delim);
    }
}

#[test]
fn read_keyword_stops_at_every_whitespace_byte() {
    // `true<ws>x` の whitespace 6 種総当たりで pos == 4 / Boolean(true) を返すことを確認する
    let whitespaces: [u8; 6] = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
    for ws in whitespaces {
        let input = [b't', b'r', b'u', b'e', ws, b'x'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_keyword(),
            Some(Token::Primitive(Primitive::Boolean(true))),
            "whitespace byte = {:#x}",
            ws
        );
        assert_eq!(lexer.position(), 4, "whitespace byte = {:#x}", ws);
    }
}

#[test]
fn read_keyword_stops_at_every_delimiter_byte() {
    // `true<delim>x` の delimiter 10 種総当たりで pos == 4 / Boolean(true) を返すことを確認する
    let delimiters: [u8; 10] = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
    for delim in delimiters {
        let input = [b't', b'r', b'u', b'e', delim, b'x'];
        let mut lexer = Lexer::new(&input);
        assert_eq!(
            lexer.read_keyword(),
            Some(Token::Primitive(Primitive::Boolean(true))),
            "delimiter byte = {:#x}",
            delim
        );
        assert_eq!(lexer.position(), 4, "delimiter byte = {:#x}", delim);
    }
}

#[test]
fn read_keyword_stops_at_eof() {
    // `obj` で入力終端の場合 Some(ObjBegin) / pos == 3 / is_eof を確認する
    let mut lexer = Lexer::new(b"obj");
    assert_eq!(lexer.read_keyword(), Some(Token::ObjBegin));
    assert_eq!(lexer.position(), 3);
    assert!(lexer.is_eof());
}

#[test]
fn read_keyword_reads_single_regular_byte() {
    // 単一の regular byte `R` が Keyword(b"R") として読み取られることを確認する
    let mut lexer = Lexer::new(b"R");
    assert_eq!(lexer.read_keyword(), Some(Token::Keyword(b"R".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn read_keyword_reads_long_unknown_byte_sequence() {
    // 長い未知バイト列 `MyCustomKeyword123` が分割されず 1 Keyword として読み取られることを確認する
    let mut lexer = Lexer::new(b"MyCustomKeyword123");
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(b"MyCustomKeyword123".to_vec()))
    );
    assert_eq!(lexer.position(), 18);
}

#[test]
fn read_keyword_does_not_rewind_on_successful_read() {
    // 成功時に pos が必ず前進する（巻き戻されない）ことを確認する
    let mut lexer = Lexer::new(b"obj");
    let start = lexer.position();
    let _ = lexer.read_keyword();
    assert!(lexer.position() > start);
}

#[test]
fn read_keyword_keeps_position_zero_on_leading_whitespace() {
    // 先頭が whitespace の入力 ` true` では None / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b" true");
    assert_eq!(lexer.read_keyword(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn read_keyword_preserves_non_ascii_bytes_in_keyword() {
    // 非 ASCII バイト 0xC3 0xA9 を含む regular 列が Keyword(<原文 bytes>) として忠実に保持されることを確認する
    let input: &[u8] = &[b'a', 0xC3, 0xA9, b'z'];
    let mut lexer = Lexer::new(input);
    assert_eq!(
        lexer.read_keyword(),
        Some(Token::Keyword(vec![b'a', 0xC3, 0xA9, b'z']))
    );
    assert_eq!(lexer.position(), 4);
}

// ---------- Phase G: next_token の合流 ----------

#[test]
fn next_token_returns_none_for_empty_input() {
    // 空入力に対する next_token が None を返し pos が 0 のままであることを確認する
    let mut lexer = Lexer::new(&[]);
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_none_at_eof() {
    // EOF 状態の next_token が None を返すことを確認する
    let mut lexer = Lexer::new(b"a");
    lexer.advance();
    assert_eq!(lexer.next_token(), None);
}

#[test]
fn next_token_returns_none_for_only_whitespace() {
    // whitespace のみの入力 `   ` で next_token が None を返し pos == 入力長まで進むことを確認する
    let mut lexer = Lexer::new(b"   ");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 3);
}

#[test]
fn next_token_dispatches_to_array_begin() {
    // `[` 入力で next_token が Some(ArrayBegin) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"[");
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_dispatches_to_array_end() {
    // `]` 入力で next_token が Some(ArrayEnd) を返し pos == 1 になることを確認する
    let mut lexer = Lexer::new(b"]");
    assert_eq!(lexer.next_token(), Some(Token::ArrayEnd));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_dispatches_to_dict_begin_on_double_less_than() {
    // `<<` 入力で next_token が Some(DictBegin) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b"<<");
    assert_eq!(lexer.next_token(), Some(Token::DictBegin));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_falls_back_to_hex_string_on_single_less_than() {
    // `<48656C6C6F>` のような 16 進文字列で next_token が Primitive(HexString(b"Hello")) を返すことを確認する
    let mut lexer = Lexer::new(b"<48656C6C6F>");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::HexString(b"Hello".to_vec())))
    );
    assert_eq!(lexer.position(), 12);
}

#[test]
fn next_token_falls_back_to_hex_string_on_empty_hex_string() {
    // 空 16 進文字列 `<>` で next_token が Primitive(HexString(b"")) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b"<>");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::HexString(b"".to_vec())))
    );
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_dispatches_to_dict_end_on_double_greater_than() {
    // `>>` 入力で next_token が Some(DictEnd) を返し pos == 2 になることを確認する
    let mut lexer = Lexer::new(b">>");
    assert_eq!(lexer.next_token(), Some(Token::DictEnd));
    assert_eq!(lexer.position(), 2);
}

#[test]
fn next_token_dispatches_to_literal_string() {
    // `(hello)` 入力で next_token が Primitive(LiteralString(b"hello")) を返すことを確認する
    let mut lexer = Lexer::new(b"(hello)");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::LiteralString(
            b"hello".to_vec()
        )))
    );
}

#[test]
fn next_token_dispatches_to_name() {
    // `/Type` 入力で next_token が Primitive(Name(b"Type")) を返すことを確認する
    let mut lexer = Lexer::new(b"/Type");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::Name(PdfName::new(
            b"Type".to_vec()
        ))))
    );
}

#[test]
fn next_token_dispatches_to_integer_on_digit() {
    // `123` 入力で next_token が Primitive(Integer(123)) を返すことを確認する
    let mut lexer = Lexer::new(b"123");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::Integer(123)))
    );
}

#[test]
fn next_token_dispatches_to_real_on_dot() {
    // `.5` 入力で next_token が Primitive(Real(0.5)) を返すことを確認する（小数部 1 桁のため f64 累積誤差なし）
    let mut lexer = Lexer::new(b".5");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::Real(0.5)))
    );
}

#[test]
fn next_token_falls_back_to_keyword_on_lone_dot() {
    // `.` 単独入力で next_token が read_real 失敗 → read_keyword フォールバックで Keyword(b".") を返すことを確認する（+/- / digit との対称性）
    let mut lexer = Lexer::new(b".");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b".".to_vec())));
    assert_eq!(lexer.position(), 1);
}

#[test]
fn next_token_falls_back_to_keyword_on_dot_followed_by_alpha() {
    // `.foo` 入力で next_token が read_real 失敗 → read_keyword フォールバックで Keyword(b".foo") を返すことを確認する
    let mut lexer = Lexer::new(b".foo");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b".foo".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_dispatches_to_real_on_digit_with_dot() {
    // `1.5` 入力で digit 分岐が read_integer 失敗 → read_real 成功で Primitive(Real(1.5)) を返し pos == 3 になることを確認する
    let mut lexer = Lexer::new(b"1.5");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Primitive(Primitive::Real(1.5)))
    );
    assert_eq!(lexer.position(), 3);
}

#[test]
fn next_token_falls_back_to_keyword_on_digit_with_non_numeric_suffix() {
    // `123abc` 入力で digit 分岐が read_integer / read_real 失敗 → read_keyword に到達し Keyword(b"123abc") を返すことを確認する
    let mut lexer = Lexer::new(b"123abc");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b"123abc".to_vec())));
    assert_eq!(lexer.position(), 6);
}

#[test]
fn next_token_dispatches_to_keyword_on_plus_letter() {
    // `+ABC` のように read_integer / read_real が失敗する `+` 始まり連結が Keyword(b"+ABC") に吸収されることを確認する
    let mut lexer = Lexer::new(b"+ABC");
    assert_eq!(lexer.next_token(), Some(Token::Keyword(b"+ABC".to_vec())));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_dispatches_to_keyword_for_obj() {
    // `obj` 入力で next_token が Some(ObjBegin) を返すことを確認する
    let mut lexer = Lexer::new(b"obj");
    assert_eq!(lexer.next_token(), Some(Token::ObjBegin));
}

#[test]
fn next_token_returns_comment_token() {
    // `%PDF-1.7\n` 入力で next_token が Comment(b"PDF-1.7") を返し pos == 9（改行直後）になることを確認する
    let mut lexer = Lexer::new(b"%PDF-1.7\n");
    assert_eq!(
        lexer.next_token(),
        Some(Token::Comment(b"PDF-1.7".to_vec()))
    );
    assert_eq!(lexer.position(), 9);
}

#[test]
fn next_token_returns_comment_for_double_percent() {
    // `%%EOF` 入力で next_token が Comment(b"%EOF") を返す（2 個目の `%` は本文の一部）ことを確認する
    let mut lexer = Lexer::new(b"%%EOF");
    assert_eq!(lexer.next_token(), Some(Token::Comment(b"%EOF".to_vec())));
}

#[test]
fn next_token_skips_leading_whitespace_then_dispatches() {
    // ` \n\t[1` 入力で先頭の whitespace 3 バイトを消費し `[` から Some(ArrayBegin) / pos == 4 を確認する
    let mut lexer = Lexer::new(b" \n\t[1");
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
    assert_eq!(lexer.position(), 4);
}

#[test]
fn next_token_sequence_for_empty_array_and_dict() {
    // `<<[]>>` を 4 回呼び出すと DictBegin / ArrayBegin / ArrayEnd / DictEnd の順に返り 5 回目で None になることを確認する
    let mut lexer = Lexer::new(b"<<[]>>");
    assert_eq!(lexer.next_token(), Some(Token::DictBegin));
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
    assert_eq!(lexer.next_token(), Some(Token::ArrayEnd));
    assert_eq!(lexer.next_token(), Some(Token::DictEnd));
    assert_eq!(lexer.next_token(), None);
}

#[test]
fn next_token_returns_none_without_advancing_for_isolated_greater_than() {
    // `>` 単独入力で next_token が None / pos == 0 を維持することを確認する（malformed 検知は parser 側に委譲）
    let mut lexer = Lexer::new(b">");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_none_without_advancing_for_unrecognized_delimiter() {
    // `{` のような仕様外 delimiter で next_token が None / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b"{");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_none_without_advancing_for_less_than_then_whitespace() {
    // `< ` のように `<<` でも 16 進開始でもない `<` パターンで next_token が None / pos == 0 を維持することを確認する
    let mut lexer = Lexer::new(b"< ");
    assert_eq!(lexer.next_token(), None);
    assert_eq!(lexer.position(), 0);
}

#[test]
fn next_token_returns_comment_then_dispatches_next_call() {
    // `% c\n[1]` を 2 回呼ぶと 1 回目 Comment(b" c") / 2 回目 ArrayBegin が返ることを確認する
    let mut lexer = Lexer::new(b"% c\n[1]");
    assert_eq!(lexer.next_token(), Some(Token::Comment(b" c".to_vec())));
    assert_eq!(lexer.next_token(), Some(Token::ArrayBegin));
}
