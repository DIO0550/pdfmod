use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

fn assert_single_int_entry(dict: &PdfDictionary, key: &str, value: i64) {
    assert_eq!(dict.len(), 1);
    assert_eq!(
        dict.get(&PdfName::from(key)),
        Some(&PdfObject::Integer(value))
    );
}

#[test]
fn parse_object_returns_dictionary_with_tab_between_key_and_value() {
    // 入力 b"<< /K\t1 >>" でキーと値の間が TAB のみでも正しく要素境界として認識されることを確認する
    let dict = parse_dict(b"<< /K\t1 >>");
    assert_single_int_entry(&dict, "K", 1);
}

#[test]
fn parse_object_returns_dictionary_with_crlf_between_key_and_value() {
    // 入力 b"<< /K\r\n1 >>" でキーと値の間が CRLF のみでも正しく要素境界として認識されることを確認する
    let dict = parse_dict(b"<< /K\r\n1 >>");
    assert_single_int_entry(&dict, "K", 1);
}

#[test]
fn parse_object_returns_dictionary_with_nul_between_key_and_value() {
    // 入力 b"<< /K\x001 >>" でキーと値の間が NUL のみ（PDF 仕様上 whitespace）でも正しく要素境界として認識されることを確認する
    let dict = parse_dict(b"<< /K\x001 >>");
    assert_single_int_entry(&dict, "K", 1);
}

#[test]
fn parse_object_returns_dictionary_with_form_feed_around_entry() {
    // 入力 b"<<\x0c/K 1\x0c>>" でエントリ前後が FF (Form Feed) でも正しく境界として認識されることを確認する
    let dict = parse_dict(b"<<\x0c/K 1\x0c>>");
    assert_single_int_entry(&dict, "K", 1);
}

#[test]
fn parse_object_returns_dictionary_with_multiple_spaces() {
    // 境界値: 入力 b"<<   /K   1   >>" で多重 SP がエントリの前後に挿入されていても正しくパースできることを確認する
    let dict = parse_dict(b"<<   /K   1   >>");
    assert_single_int_entry(&dict, "K", 1);
}
