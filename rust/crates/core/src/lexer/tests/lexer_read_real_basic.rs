use super::super::Lexer;

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
