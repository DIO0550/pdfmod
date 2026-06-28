use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

fn expect_inner_dict<'a>(dict: &'a PdfDictionary, key: &str) -> &'a PdfDictionary {
    match dict.get(&PdfName::from(key)) {
        Some(PdfObject::Dictionary(d)) => d,
        other => panic!("expected nested Dictionary at /{}, got {:?}", key, other),
    }
}

#[test]
fn parse_object_returns_two_level_nested_dictionary() {
    // 入力 b"<< /Sub << /K 1 >> >>" で 2 段ネスト辞書 /Sub の値が Dictionary(/K==Integer(1)) になることを確認する
    let dict = parse_dict(b"<< /Sub << /K 1 >> >>");
    let inner = expect_inner_dict(&dict, "Sub");
    assert_eq!(inner.len(), 1);
    assert_eq!(inner.get(&PdfName::from("K")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_returns_three_level_nested_dictionary() {
    // 入力 b"<< /A << /B << /C 1 >> >> >>" で 3 段ネスト辞書を再帰的にパースし最深 /C==Integer(1) を取得できることを確認する
    let dict = parse_dict(b"<< /A << /B << /C 1 >> >> >>");
    let level1 = expect_inner_dict(&dict, "A");
    let level2 = expect_inner_dict(level1, "B");
    assert_eq!(level2.len(), 1);
    assert_eq!(
        level2.get(&PdfName::from("C")),
        Some(&PdfObject::Integer(1))
    );
}

#[test]
fn parse_object_returns_two_sibling_nested_dictionaries() {
    // 入力 b"<< /A << /X 1 >> /B << /Y 2 >> >>" で兄弟ネスト辞書が独立して保持されることを確認する
    let dict = parse_dict(b"<< /A << /X 1 >> /B << /Y 2 >> >>");
    assert_eq!(dict.len(), 2);
    let a = expect_inner_dict(&dict, "A");
    assert_eq!(a.get(&PdfName::from("X")), Some(&PdfObject::Integer(1)));
    let b = expect_inner_dict(&dict, "B");
    assert_eq!(b.get(&PdfName::from("Y")), Some(&PdfObject::Integer(2)));
}

#[test]
fn parse_object_returns_five_level_nested_dictionary() {
    // 入力 b"<< /A << /B << /C << /D << /E 1 >> >> >> >> >>" で 5 段の深ネスト辞書を再帰的にパースできることを確認する
    let dict = parse_dict(b"<< /A << /B << /C << /D << /E 1 >> >> >> >> >>");
    let l1 = expect_inner_dict(&dict, "A");
    let l2 = expect_inner_dict(l1, "B");
    let l3 = expect_inner_dict(l2, "C");
    let l4 = expect_inner_dict(l3, "D");
    assert_eq!(l4.get(&PdfName::from("E")), Some(&PdfObject::Integer(1)));
}
