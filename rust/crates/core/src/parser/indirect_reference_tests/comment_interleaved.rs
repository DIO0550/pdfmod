use super::{parser, reference};

#[test]
fn parse_object_returns_reference_for_comment_between_generation_and_r() {
    // コメント透過: b"1 0 % c\nR" は G と R の間のコメントを skip して Reference(1, 0) を返す
    let mut p = parser(b"1 0 % c\nR");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}

#[test]
fn parse_object_returns_reference_for_comment_between_object_number_and_generation() {
    // コメント透過: b"1 % c\n0 R" は N と G の間のコメントを skip して Reference(1, 0) を返す
    let mut p = parser(b"1 % c\n0 R");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}

#[test]
fn parse_object_returns_reference_for_leading_comment_before_reference() {
    // コメント透過: b"% c\n1 0 R" は先頭コメントを skip して Reference(1, 0) を返す
    let mut p = parser(b"% c\n1 0 R");
    assert_eq!(p.parse_object(), Ok(reference(1, 0)));
}
