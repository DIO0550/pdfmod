use super::super::ParsedXRefTable;
use super::table;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;

// 先頭サブセクションが 1 始まりでも、0 に補正されずそのまま登録されることを確認する
#[test]
fn subsection_starting_at_one_is_registered_without_correction() {
    let input = table(
        &[(1, &["0000000017 00000 n", "0000000058 00000 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("subsection starting at 1 should parse");
    // 0 番は #334 以降そもそもキーとして表現できない
    assert!(ObjectNumber::new(0).is_none());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(1).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(2).expect("positive object number"))
        .is_some());
}

// オブジェクト番号 0 が存在しないテーブルでもエラーにならないことを確認する
#[test]
fn table_without_object_zero_is_accepted() {
    let input = table(
        &[(10, &["0000000017 00000 n", "0000000058 00000 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("table without object 0 should parse");
    assert_eq!(parsed.table().len(), 2);
    assert!(ObjectNumber::new(0).is_none());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(10).expect("positive object number"))
        .is_some());
    assert!(parsed
        .table()
        .get(ObjectNumber::new(11).expect("positive object number"))
        .is_some());
}

// オブジェクト番号 0 の世代が 65535 でなくてもエラーにならないことを確認する。
// 0 番は表には登録されない（#334）が、世代の値は検証対象外のまま。
// 「0 番が in-use で宣言されていても壊れない」観点は zero_entry.rs へ移設した。
#[test]
fn object_zero_with_non_default_generation_is_accepted() {
    let input = table(&[(0, &["0000000000 00000 f"])], " \r\n", "trailer");
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("object 0 with generation 0 should parse");
    assert!(parsed.table().is_empty());
}

// オフセットが入力長を超えていても検証されず登録されることを確認する
#[test]
fn offset_beyond_input_length_is_accepted() {
    let input = table(&[(1, &["9999999999 00000 n"])], " \r\n", "trailer");
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("large offset should not be validated against input length");
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(1).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(9999999999),
            generation: GenerationNumber::new(0),
        })
    );
}

// 世代番号 65535（u16 上限ちょうど）とオフセット u64::MAX が通ることを確認する
#[test]
fn boundary_values_are_accepted() {
    let input = table(
        &[(1, &["18446744073709551615 65535 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = ParsedXRefTable::parse(&input, ByteOffset::new(0))
        .expect("u64::MAX offset and generation 65535 should parse");
    assert_eq!(
        parsed
            .table()
            .get(ObjectNumber::new(1).expect("positive object number")),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(u64::MAX),
            generation: GenerationNumber::new(65535),
        })
    );
}
