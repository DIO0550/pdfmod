use super::super::super::object::pdf_object::PdfObject;
use super::{indirect_object, parser};

#[test]
fn parse_indirect_object_skips_comment_between_n_and_g() {
    // コメント透過(N-G 間): b"1 % c\n0 obj 42 endobj" の N と G の間のコメントがスキップされる
    let mut p = parser(b"1 % c\n0 obj 42 endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(1, 0, PdfObject::Integer(42)))
    );
}

#[test]
fn parse_indirect_object_skips_comment_between_g_and_obj() {
    // コメント透過(G-obj 間): b"1 0 % c\nobj 42 endobj" の G と obj の間のコメントがスキップされる
    let mut p = parser(b"1 0 % c\nobj 42 endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(1, 0, PdfObject::Integer(42)))
    );
}

#[test]
fn parse_indirect_object_skips_comment_between_obj_and_content() {
    // コメント透過(obj-content 間): b"1 0 obj % c\n42 endobj" の obj と content の間のコメントがスキップされる
    let mut p = parser(b"1 0 obj % c\n42 endobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(1, 0, PdfObject::Integer(42)))
    );
}

#[test]
fn parse_indirect_object_skips_comment_between_content_and_endobj() {
    // コメント透過(content-endobj 間): b"1 0 obj 42 % c\nendobj" の content と endobj の間のコメントがスキップされる
    let mut p = parser(b"1 0 obj 42 % c\nendobj");
    assert_eq!(
        p.parse_indirect_object(),
        Ok(indirect_object(1, 0, PdfObject::Integer(42)))
    );
}
