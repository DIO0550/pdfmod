use super::lexer;

#[test]
fn take_token_only_path_keeps_buffer_capacity_zero() {
    // take_token のみを連続呼び出しした場合、VecDeque の初回割り当てが発生せず capacity==0 のままであることを確認する
    let mut lex = lexer(b"1 2 3 4 5");
    for _ in 0..5 {
        let _ = lex.take_token();
    }
    assert_eq!(lex.buffer_capacity_for_tests(), 0);
}

#[test]
fn take_token_with_pos_only_path_keeps_buffer_capacity_zero() {
    // take_token_with_pos のみを連続呼び出しした場合も capacity==0 のままであることを確認する
    let mut lex = lexer(b"1 2 3");
    for _ in 0..3 {
        let _ = lex.take_token_with_pos();
    }
    assert_eq!(lex.buffer_capacity_for_tests(), 0);
}
