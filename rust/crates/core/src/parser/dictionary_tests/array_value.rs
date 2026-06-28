use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parser;

fn parse_object_at(input: &[u8]) -> PdfObject {
    // テスト用ヘルパ: 入力をパースして PdfObject を取り出す（top-level が辞書か配列か区別しないケースで使う）
    let mut p = parser(input);
    p.parse_object().expect("object should parse")
}

#[test]
fn parse_object_returns_dictionary_with_integer_array_value() {
    // 入力 b"<< /A [1 2 3] >>" で /A の値が 3 要素 Integer 配列になることを確認する
    let dict = match parse_object_at(b"<< /A [1 2 3] >>") {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    };
    assert_eq!(
        dict.get(&PdfName::from("A")),
        Some(&PdfObject::Array(vec![
            PdfObject::Integer(1),
            PdfObject::Integer(2),
            PdfObject::Integer(3),
        ]))
    );
}

#[test]
fn parse_object_returns_dictionary_with_array_containing_dictionary() {
    // 入力 b"<< /A [<< /K 1 >>] >>" で /A の値が「辞書 1 個の配列」になることを確認する（配列内辞書サポート、UC-1）
    let dict = match parse_object_at(b"<< /A [<< /K 1 >>] >>") {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    };
    let mut inner = PdfDictionary::new();
    inner.insert(PdfName::from("K"), PdfObject::Integer(1));
    assert_eq!(
        dict.get(&PdfName::from("A")),
        Some(&PdfObject::Array(vec![PdfObject::Dictionary(inner)]))
    );
}

#[test]
fn parse_object_returns_array_with_single_dictionary_element() {
    // 入力 b"[ << /K 1 >> ]" で配列要素として辞書 1 個を持つ配列を返すことを確認する（配列対称性、UC-1）
    let mut inner = PdfDictionary::new();
    inner.insert(PdfName::from("K"), PdfObject::Integer(1));
    assert_eq!(
        parse_object_at(b"[ << /K 1 >> ]"),
        PdfObject::Array(vec![PdfObject::Dictionary(inner)])
    );
}

#[test]
fn parse_object_returns_array_with_two_dictionary_elements() {
    // 入力 b"[ << /K 1 >> << /K 2 >> ]" で配列要素として辞書 2 個を持つ配列を返すことを確認する
    let mut d1 = PdfDictionary::new();
    d1.insert(PdfName::from("K"), PdfObject::Integer(1));
    let mut d2 = PdfDictionary::new();
    d2.insert(PdfName::from("K"), PdfObject::Integer(2));
    assert_eq!(
        parse_object_at(b"[ << /K 1 >> << /K 2 >> ]"),
        PdfObject::Array(vec![PdfObject::Dictionary(d1), PdfObject::Dictionary(d2)])
    );
}
