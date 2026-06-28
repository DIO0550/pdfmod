use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

#[test]
fn parse_object_drops_single_null_value_entry() {
    // 入力 b"<< /A null >>" で /A が登録されず len==0 になることを確認する（UC-3 null 正規化）
    let dict = parse_dict(b"<< /A null >>");
    assert!(!dict.contains_key(&PdfName::from("A")));
    assert_eq!(dict.len(), 0);
}

#[test]
fn parse_object_drops_intermediate_null_value_keeping_others() {
    // 入力 b"<< /A 1 /B null /C 3 >>" で /B が登録されず /A と /C のみ登録、len==2 になることを確認する
    let dict = parse_dict(b"<< /A 1 /B null /C 3 >>");
    assert_eq!(dict.len(), 2);
    assert_eq!(dict.get(&PdfName::from("A")), Some(&PdfObject::Integer(1)));
    assert!(!dict.contains_key(&PdfName::from("B")));
    assert_eq!(dict.get(&PdfName::from("C")), Some(&PdfObject::Integer(3)));
}

#[test]
fn parse_object_revives_key_overwritten_with_non_null_after_null() {
    // 入力 b"<< /A null /A 1 >>" で /A の値が Integer(1) として登録され len==1 になることを確認する（null 後の上書きで復活）
    let dict = parse_dict(b"<< /A null /A 1 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(dict.get(&PdfName::from("A")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_drops_key_when_null_overwrites_existing_value() {
    // 入力 b"<< /A 1 /A null >>" で /A が null で上書きされて削除され len==0 になることを確認する（重複キーの null 上書き）
    let dict = parse_dict(b"<< /A 1 /A null >>");
    assert!(!dict.contains_key(&PdfName::from("A")));
    assert_eq!(dict.len(), 0);
}
