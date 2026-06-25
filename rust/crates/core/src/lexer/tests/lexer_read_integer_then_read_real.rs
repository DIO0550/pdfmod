use super::super::Lexer;

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
