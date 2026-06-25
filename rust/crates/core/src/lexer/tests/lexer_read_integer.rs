use super::super::Lexer;

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
