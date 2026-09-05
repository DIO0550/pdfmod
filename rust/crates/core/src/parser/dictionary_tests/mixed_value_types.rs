use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::super::super::object::string::PdfString;
use super::parse_dict;

#[test]
fn parse_object_returns_dictionary_with_all_value_types_mixed() {
    // 入力 1 辞書内に Boolean / Integer / Real / String / Name / Array / Dictionary を混在し、各キーが正しい型を保持することを確認する
    let dict = parse_dict(b"<< /B true /I 12 /R 0.5 /S (x) /N /V /Arr [1] /Dict << /K 1 >> >>");
    assert_eq!(dict.len(), 7);
    assert_eq!(
        dict.get(&PdfName::from("B")),
        Some(&PdfObject::Boolean(true))
    );
    assert_eq!(dict.get(&PdfName::from("I")), Some(&PdfObject::Integer(12)));
    assert_eq!(dict.get(&PdfName::from("R")), Some(&PdfObject::Real(0.5)));
    assert_eq!(
        dict.get(&PdfName::from("S")),
        Some(&PdfObject::String(PdfString::literal(b"x")))
    );
    assert_eq!(
        dict.get(&PdfName::from("N")),
        Some(&PdfObject::Name(PdfName::from("V")))
    );
    assert_eq!(
        dict.get(&PdfName::from("Arr")),
        Some(&PdfObject::Array(vec![PdfObject::Integer(1)]))
    );
    let mut inner = PdfDictionary::new();
    inner.insert(PdfName::from("K"), PdfObject::Integer(1));
    assert_eq!(
        dict.get(&PdfName::from("Dict")),
        Some(&PdfObject::Dictionary(inner))
    );
}
