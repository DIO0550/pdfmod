use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

#[test]
fn parse_object_returns_dictionary_with_three_entries() {
    // 入力 b"<< /A 1 /B 2 /C 3 >>" で 3 エントリ辞書 (len==3) を返し各キーに対応する値が一致することを確認する
    let dict = parse_dict(b"<< /A 1 /B 2 /C 3 >>");
    assert_eq!(dict.len(), 3);
    assert_eq!(dict.get(&PdfName::from("A")), Some(&PdfObject::Integer(1)));
    assert_eq!(dict.get(&PdfName::from("B")), Some(&PdfObject::Integer(2)));
    assert_eq!(dict.get(&PdfName::from("C")), Some(&PdfObject::Integer(3)));
}

#[test]
fn parse_object_returns_dictionary_with_five_entries() {
    // 入力 b"<< /A 1 /B 2 /C 3 /D 4 /E 5 >>" で 5 エントリ辞書 (len==5) を返すことを確認する（スケール検証）
    let dict = parse_dict(b"<< /A 1 /B 2 /C 3 /D 4 /E 5 >>");
    assert_eq!(dict.len(), 5);
    for (key, value) in [("A", 1), ("B", 2), ("C", 3), ("D", 4), ("E", 5)] {
        assert_eq!(
            dict.get(&PdfName::from(key)),
            Some(&PdfObject::Integer(value))
        );
    }
}

#[test]
fn parse_object_returns_dictionary_with_one_hundred_entries() {
    // 境界値: 100 エントリの大量データでも全キーが contains_key で true / len==100 になることを確認する
    let mut input: Vec<u8> = b"<<".to_vec();
    for i in 0..100 {
        input.extend_from_slice(format!(" /K{} {}", i, i).as_bytes());
    }
    input.extend_from_slice(b" >>");

    let dict = parse_dict(&input);
    assert_eq!(dict.len(), 100);
    for i in 0..100 {
        let key = PdfName::from(format!("K{}", i).as_str());
        assert_eq!(dict.get(&key), Some(&PdfObject::Integer(i)));
    }
}
