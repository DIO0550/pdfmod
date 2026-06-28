use super::super::super::object::dictionary::PdfDictionary;
use super::super::super::object::pdf_object::PdfObject;
use super::parser;

#[test]
fn parse_object_returns_empty_dictionary_for_double_angle_only() {
    // 入力 b"<<>>" で区切り文字なしの最短空辞書 Ok(Dictionary(空)) を返すことを確認する
    let mut p = parser(b"<<>>");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Dictionary(PdfDictionary::new()))
    );
}

#[test]
fn parse_object_returns_empty_dictionary_for_double_angle_with_space() {
    // 入力 b"<< >>" で内部空白あり空辞書 Ok(Dictionary(空)) を返すことを確認する
    let mut p = parser(b"<< >>");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Dictionary(PdfDictionary::new()))
    );
}

#[test]
fn parse_object_returns_empty_dictionary_for_mixed_whitespace() {
    // 境界値: 入力 b"<<\n\t  \n>>" で改行・タブ・空白混在の空辞書を返すことを確認する
    let mut p = parser(b"<<\n\t  \n>>");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Dictionary(PdfDictionary::new()))
    );
}

#[test]
fn parse_object_returns_empty_dictionary_for_comment_only() {
    // エッジ: 入力 b"<< %a\n>>" でコメントのみの空辞書を Comment 透過スキップで返すことを確認する
    let mut p = parser(b"<< %a\n>>");
    assert_eq!(
        p.parse_object(),
        Ok(PdfObject::Dictionary(PdfDictionary::new()))
    );
}
