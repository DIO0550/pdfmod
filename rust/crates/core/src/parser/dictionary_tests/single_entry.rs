use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::super::super::object::string::PdfString;
use super::parse_dict;

#[test]
fn parse_object_returns_dictionary_with_integer_value() {
    // 入力 b"<< /K 1 >>" で値が Integer(1) の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K 1 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(dict.get(&PdfName::from("K")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_returns_dictionary_with_real_value() {
    // 入力 b"<< /K 1.5 >>" で値が Real(1.5) の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K 1.5 >>");
    assert_eq!(dict.get(&PdfName::from("K")), Some(&PdfObject::Real(1.5)));
}

#[test]
fn parse_object_returns_dictionary_with_boolean_value() {
    // 入力 b"<< /K true >>" で値が Boolean(true) の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K true >>");
    assert_eq!(
        dict.get(&PdfName::from("K")),
        Some(&PdfObject::Boolean(true))
    );
}

#[test]
fn parse_object_returns_dictionary_with_literal_string_value() {
    // 入力 b"<< /K (str) >>" で値が String(b"str") の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K (str) >>");
    assert_eq!(
        dict.get(&PdfName::from("K")),
        Some(&PdfObject::String(PdfString::literal(b"str")))
    );
}

#[test]
fn parse_object_returns_dictionary_with_hex_string_value() {
    // 入力 b"<< /K <48> >>" で値が String(b"H") の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K <48> >>");
    assert_eq!(
        dict.get(&PdfName::from("K")),
        Some(&PdfObject::String(PdfString::hex(b"H")))
    );
}

#[test]
fn parse_object_returns_dictionary_with_name_value() {
    // 入力 b"<< /K /V >>" で値が Name("V") の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K /V >>");
    assert_eq!(
        dict.get(&PdfName::from("K")),
        Some(&PdfObject::Name(PdfName::from("V")))
    );
}

#[test]
fn parse_object_treats_consecutive_names_as_key_value_pair() {
    // 入力 b"<< /K1 /K2 >>" で /K1 の値が Name("K2") として解釈され dict.len()==1 / dict.get(/K1)==Some(&Name("K2")) になることを確認する（仕様準拠の副次挙動）
    let dict = parse_dict(b"<< /K1 /K2 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(
        dict.get(&PdfName::from("K1")),
        Some(&PdfObject::Name(PdfName::from("K2")))
    );
}

#[test]
fn parse_object_returns_dictionary_with_array_value() {
    // 入力 b"<< /K [1 2] >>" で値が Array([Integer(1), Integer(2)]) の単一エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K [1 2] >>");
    assert_eq!(
        dict.get(&PdfName::from("K")),
        Some(&PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
        ]))
    );
}

#[test]
fn parse_object_returns_dictionary_with_nested_dictionary_value() {
    // 入力 b"<< /K << /X 1 >> >>" でネスト辞書値（内側 /X==Integer(1)）を返すことを確認する
    let dict = parse_dict(b"<< /K << /X 1 >> >>");
    let inner = match dict.get(&PdfName::from("K")) {
        Some(PdfObject::Dictionary(d)) => d,
        other => panic!("expected nested Dictionary, got {:?}", other),
    };
    assert_eq!(inner.len(), 1);
    assert_eq!(inner.get(&PdfName::from("X")), Some(&PdfObject::Integer(1)));
}
