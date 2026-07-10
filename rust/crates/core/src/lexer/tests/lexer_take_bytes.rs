use super::super::Lexer;

#[test]
fn take_bytes_returns_slice_when_within_bounds() {
    // 入力範囲内で len バイトの slice を返し、pos が len 分進むことを確認する
    let mut lexer = Lexer::new(b"abcdef");
    assert_eq!(lexer.take_bytes(3), Some(&b"abc"[..]));
    assert_eq!(lexer.cursor_position(), 3);
}

#[test]
fn take_bytes_returns_none_when_out_of_bounds() {
    // 入力範囲を超える len を渡すと None を返し、pos は変わらないことを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.take_bytes(5), None);
    assert_eq!(lexer.cursor_position(), 0);
}

#[test]
fn take_bytes_zero_length_returns_empty_slice() {
    // len=0 で空 slice を返し、pos が変わらないことを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.take_bytes(0), Some(&b""[..]));
    assert_eq!(lexer.cursor_position(), 0);
}

#[test]
fn take_bytes_advances_position_correctly() {
    // 連続呼び出しで pos が期待どおり進むことを確認する（三角測量）
    let mut lexer = Lexer::new(b"abcdefgh");
    assert_eq!(lexer.take_bytes(2), Some(&b"ab"[..]));
    assert_eq!(lexer.cursor_position(), 2);
    assert_eq!(lexer.take_bytes(3), Some(&b"cde"[..]));
    assert_eq!(lexer.cursor_position(), 5);
    assert_eq!(lexer.take_bytes(3), Some(&b"fgh"[..]));
    assert_eq!(lexer.cursor_position(), 8);
}

#[test]
fn take_bytes_returns_none_on_overflow_without_moving_pos() {
    // pos + len が usize オーバーフローする場合、None を返して pos が不変であることを確認する
    let mut lexer = Lexer::new(b"abc");
    // 入力長 3 に対して usize::MAX を渡すと checked_add で捕捉され None が返る
    assert_eq!(lexer.take_bytes(usize::MAX), None);
    assert_eq!(lexer.cursor_position(), 0);
}

#[test]
fn input_returns_full_byte_slice() {
    // input() が入力全体への参照を返すことを確認する
    let lexer = Lexer::new(b"hello world");
    assert_eq!(lexer.input(), b"hello world");
}

#[test]
fn input_returns_empty_slice_for_empty_input() {
    // 空入力の input() が空 slice を返すことを確認する
    let lexer = Lexer::new(&[]);
    assert_eq!(lexer.input(), b"");
}

#[test]
fn skip_bytes_moves_position_within_bounds() {
    // 範囲内で pos が n バイト進むことを確認する
    let mut lexer = Lexer::new(b"abcdef");
    assert_eq!(lexer.skip_bytes(3), Some(()));
    assert_eq!(lexer.cursor_position(), 3);
}

#[test]
fn skip_bytes_returns_none_when_out_of_bounds() {
    // 範囲外の n を渡すと None を返し、pos は不変であることを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.skip_bytes(5), None);
    assert_eq!(lexer.cursor_position(), 0);
}

#[test]
fn skip_bytes_zero_returns_some_without_moving_pos() {
    // n=0 で Some(()) を返し、pos が動かないことを確認する
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.skip_bytes(0), Some(()));
    assert_eq!(lexer.cursor_position(), 0);
}

#[test]
fn skip_bytes_to_end_of_input_succeeds() {
    // 入力末尾ちょうどまでスキップできることを確認する（境界値）
    let mut lexer = Lexer::new(b"abc");
    assert_eq!(lexer.skip_bytes(3), Some(()));
    assert_eq!(lexer.cursor_position(), 3);
    assert!(lexer.is_eof());
}
