use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_array_for_mixed_whitespace() {
    // 入力 b"[\t1\r\n2\x0C3 ]" で TAB / CRLF / FF / SP 混在のホワイトスペースを正しく要素境界として解釈することを確認する
    let mut p = parser(b"[\t1\r\n2\x0C3 ]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(3),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_nul_separator_compound() {
    // 入力 b"[1\x002]" で NUL 区切り (複合) のホワイトスペース処理を確認する
    let mut p = parser(b"[1\x002]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_multiple_spaces() {
    // 境界値: 入力 b"[   1   ]" で多重 SP に囲まれた単一要素を確認する
    let mut p = parser(b"[   1   ]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Integer(1)]))
    );
}

#[test]
fn parse_object_returns_array_for_crlf_only_separator() {
    // 入力 b"[1\r\n2\r\n3]" で CRLF のみで要素分離された 3 要素配列を返すことを確認する
    let mut p = parser(b"[1\r\n2\r\n3]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(3),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_nul_only_separator() {
    // 入力 b"[\x001\x002\x00]" で NUL 単独区切りの 2 要素配列を返すことを確認する
    let mut p = parser(b"[\x001\x002\x00]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
        ]))
    );
}
