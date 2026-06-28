use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

#[test]
fn parse_object_dedups_duplicate_key_keeping_latest_value() {
    // 入力 b"<< /A 1 /A 2 >>" で /A の値が最後の Integer(2) になり len==1 であることを確認する（UC-3 最後勝ち）
    let dict = parse_dict(b"<< /A 1 /A 2 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(dict.get(&PdfName::from("A")), Some(&PdfObject::Integer(2)));
}

#[test]
fn parse_object_dedups_triple_duplicate_key_keeping_latest_value() {
    // 入力 b"<< /A 1 /A 2 /A 3 >>" で /A の値が最後の Integer(3) になり len==1 であることを確認する
    let dict = parse_dict(b"<< /A 1 /A 2 /A 3 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(dict.get(&PdfName::from("A")), Some(&PdfObject::Integer(3)));
}

#[test]
fn parse_object_dedups_same_value_reinsert_keeping_len_one() {
    // 入力 b"<< /A 1 /A 1 >>" で /A の値が Integer(1) のまま len==1 になることを確認する（同値再挿入）
    let dict = parse_dict(b"<< /A 1 /A 1 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(dict.get(&PdfName::from("A")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_dedups_different_variant_reinsert_keeping_latest() {
    // 入力 b"<< /A 1 /A (str) >>" で /A の値が最後の String(b"str") になり len==1 であることを確認する（異種値再挿入）
    let dict = parse_dict(b"<< /A 1 /A (str) >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(
        dict.get(&PdfName::from("A")),
        Some(&PdfObject::String(b"str".to_vec()))
    );
}
