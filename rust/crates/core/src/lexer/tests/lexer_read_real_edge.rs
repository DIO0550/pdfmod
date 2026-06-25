use super::super::Lexer;

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
