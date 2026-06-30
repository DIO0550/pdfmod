use super::{parser, reference};

#[test]
fn parse_object_returns_reference_for_tab_separated_tokens() {
    // ホワイトスペース変種: TAB 区切り b"1 0\tR" でも Reference(1, 0) を返すことを確認する
    let mut p = parser(b"1 0\tR");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}

#[test]
fn parse_object_returns_reference_for_crlf_separated_tokens() {
    // ホワイトスペース変種: CRLF 区切り b"1 0\r\nR" でも Reference(1, 0) を返すことを確認する
    let mut p = parser(b"1 0\r\nR");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}

#[test]
fn parse_object_returns_reference_for_nul_separated_tokens() {
    // ホワイトスペース変種: NUL 区切り b"1\x000\x00R" でも Reference(1, 0) を返すことを確認する
    let mut p = parser(b"1\x000\x00R");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}
