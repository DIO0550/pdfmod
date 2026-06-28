use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_array_for_five_scalar_mix() {
    // 入力 b"[null true /N (s) <414243>]" で 5 種スカラ混在配列が型ごと正しく分配されることを確認する
    let mut p = parser(b"[null true /N (s) <414243>]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Name(PdfName::new(b"N".to_vec())),
            PdfObject::String(b"s".to_vec()),
            PdfObject::String(b"ABC".to_vec()),
        ]))
    );
}

#[test]
#[allow(clippy::approx_constant)]
fn parse_object_returns_array_for_integer_and_real_mix() {
    // 入力 b"[1 3.14 -0]" で Integer / Real / 符号付き混在が正しく振り分けられることを確認する
    let mut p = parser(b"[1 3.14 -0]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Real(3.14),
            PdfObject::Integer(0),
        ]))
    );
}

#[test]
fn parse_object_returns_array_for_eight_repeated_integers() {
    // 入力 b"[1 1 1 1 1 1 1 1]" で同型反復長尺 8 要素の Array を返すことを確認する
    let mut p = parser(b"[1 1 1 1 1 1 1 1]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![PdfObject::Integer(1); 8]))
    );
}

#[test]
fn parse_object_returns_array_for_bool_name_adjacent() {
    // 入力 b"[true /A false /B]" で Bool / Name が隣接した 4 要素配列が順序保存で返ることを確認する
    let mut p = parser(b"[true /A false /B]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Boolean(true),
            PdfObject::Name(PdfName::new(b"A".to_vec())),
            PdfObject::Boolean(false),
            PdfObject::Name(PdfName::new(b"B".to_vec())),
        ]))
    );
}

#[test]
#[allow(clippy::approx_constant)]
fn parse_object_returns_array_for_negative_and_zero_real() {
    // 入力 b"[-1 -3.14 0.0]" で負数 Integer / 負数 Real / ゼロ Real が正しく振り分けられることを確認する
    let mut p = parser(b"[-1 -3.14 0.0]");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Array(vec![
            PdfObject::Integer(-1),
            PdfObject::Real(-3.14),
            PdfObject::Real(0.0),
        ]))
    );
}
