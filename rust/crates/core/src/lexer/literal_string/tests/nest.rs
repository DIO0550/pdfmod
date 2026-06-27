use super::super::*;

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
