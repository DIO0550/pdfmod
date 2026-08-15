use super::super::parse_classic_xref_table;
use crate::byte_offset::ByteOffset;

// end が trailer キーワードの先頭バイトを指すことを確認する
#[test]
fn end_points_at_trailer_keyword() {
    let input = b"xref\n0 1\n0000000000 65535 f \ntrailer\n<< /Size 1 >>";
    let expected = input
        .windows(b"trailer".len())
        .position(|window| window == b"trailer")
        .expect("test input should contain the trailer keyword");
    let parsed =
        parse_classic_xref_table(input, ByteOffset::new(0)).expect("standard table should parse");
    assert_eq!(parsed.end(), ByteOffset::new(expected as u64));
}

// サブセクションが 1 つも無い場合でも空テーブルと trailer 位置が返ることを確認する
#[test]
fn table_without_subsections_returns_empty_table() {
    let input = b"xref\ntrailer";
    let parsed = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect("xref keyword followed by trailer should parse");
    assert!(parsed.table().is_empty());
    assert_eq!(parsed.end(), ByteOffset::new(b"xref\n".len() as u64));
}

// テーブル直後がコメント行（%%EOF）の場合、コメントを読み飛ばした先が end になることを確認する
#[test]
fn end_skips_comment_after_table() {
    let input = b"xref\n0 1\n0000000000 65535 f \n%%EOF\n";
    let parsed = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect("table followed by %%EOF should parse");
    assert_eq!(parsed.end(), ByteOffset::new(input.len() as u64));
}

// テーブル直後が任意の非数字トークンの場合、そのトークン先頭が end になることを確認する
#[test]
fn end_points_at_non_digit_token() {
    let input = b"xref\n0 1\n0000000000 65535 f \ngarbage";
    let expected = input
        .windows(b"garbage".len())
        .position(|window| window == b"garbage")
        .expect("test input should contain garbage");
    let parsed = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect("table followed by non-digit token should parse");
    assert_eq!(parsed.end(), ByteOffset::new(expected as u64));
}

// エントリ直後で入力が尽きる場合、end が入力長と等しくなることを確認する
#[test]
fn end_equals_input_length_when_input_ends_after_entries() {
    let input = b"xref\n0 1\n0000000000 65535 f \n";
    let parsed = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect("table ending at EOF should parse");
    assert_eq!(parsed.end(), ByteOffset::new(input.len() as u64));
}

// 末尾に空白だけが残る場合、end が入力長と等しくなることを確認する
#[test]
fn end_skips_trailing_whitespace() {
    let input = b"xref\n0 1\n0000000000 65535 f \n\n  ";
    let parsed = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect("table with trailing whitespace should parse");
    assert_eq!(parsed.end(), ByteOffset::new(input.len() as u64));
}
