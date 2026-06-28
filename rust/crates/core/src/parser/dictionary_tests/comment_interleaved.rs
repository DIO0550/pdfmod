use super::super::super::object::name::PdfName;
use super::super::super::object::pdf_object::PdfObject;
use super::parse_dict;

#[test]
fn parse_object_skips_comment_immediately_after_open() {
    // 入力 b"<<%a\n>>" で開き直後コメントが透過スキップされ空辞書を返すことを確認する
    let dict = parse_dict(b"<<%a\n>>");
    assert!(dict.is_empty());
}

#[test]
fn parse_object_skips_comment_before_key() {
    // 入力 b"<< %a\n /K 1 >>" でキー前コメントが透過スキップされ /K==Integer(1) を返すことを確認する
    let dict = parse_dict(b"<< %a\n /K 1 >>");
    assert_eq!(dict.len(), 1);
    assert_eq!(dict.get(&PdfName::from("K")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_skips_comment_between_key_and_value() {
    // 入力 b"<< /K %b\n 1 >>" でキーと値の間のコメントが透過スキップされ /K==Integer(1) を返すことを確認する
    let dict = parse_dict(b"<< /K %b\n 1 >>");
    assert_eq!(dict.get(&PdfName::from("K")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_skips_comment_at_end() {
    // 入力 b"<< /K 1 %c\n >>" で末尾コメントが透過スキップされ /K==Integer(1) を返すことを確認する
    let dict = parse_dict(b"<< /K 1 %c\n >>");
    assert_eq!(dict.get(&PdfName::from("K")), Some(&PdfObject::Integer(1)));
}

#[test]
fn parse_object_skips_comment_between_entries() {
    // 入力 b"<< /K 1 %d\n /L 2 >>" でエントリ間コメントが透過スキップされ 2 エントリ辞書を返すことを確認する
    let dict = parse_dict(b"<< /K 1 %d\n /L 2 >>");
    assert_eq!(dict.len(), 2);
    assert_eq!(dict.get(&PdfName::from("K")), Some(&PdfObject::Integer(1)));
    assert_eq!(dict.get(&PdfName::from("L")), Some(&PdfObject::Integer(2)));
}
