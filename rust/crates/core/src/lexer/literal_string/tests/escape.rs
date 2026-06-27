use super::super::*;

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
