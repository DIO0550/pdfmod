use super::super::parse_classic_xref_table;
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
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("subsection starting at 1 should parse");
    assert!(parsed.table().get(ObjectNumber::new(0)).is_none());
    assert!(parsed.table().get(ObjectNumber::new(1)).is_some());
    assert!(parsed.table().get(ObjectNumber::new(2)).is_some());
}

// オブジェクト番号 0 が存在しないテーブルでもエラーにならないことを確認する
#[test]
fn table_without_object_zero_is_accepted() {
    let input = table(
        &[(10, &["0000000017 00000 n", "0000000058 00000 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("table without object 0 should parse");
    assert_eq!(parsed.table().len(), 2);
    assert!(parsed.table().get(ObjectNumber::new(0)).is_none());
    assert!(parsed.table().get(ObjectNumber::new(10)).is_some());
    assert!(parsed.table().get(ObjectNumber::new(11)).is_some());
}

// オブジェクト番号 0 の世代が 65535 でなくてもエラーにならずそのまま登録されることを確認する
#[test]
fn object_zero_with_non_default_generation_is_accepted() {
    let input = table(&[(0, &["0000000000 00000 f"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("object 0 with generation 0 should parse");
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::Free {
            next_free_object: ObjectNumber::new(0),
            generation: GenerationNumber::new(0),
        })
    );
}

// オブジェクト番号 0 が in-use として宣言されてもエラーにならず登録されることを確認する
#[test]
fn object_zero_without_conventional_free_head_is_accepted() {
    let input = table(&[(0, &["0000000017 00000 n"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("object 0 declared in-use should still parse");
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(17),
            generation: GenerationNumber::new(0),
        })
    );
}

// オフセットが入力長を超えていても検証されず登録されることを確認する
#[test]
fn offset_beyond_input_length_is_accepted() {
    let input = table(&[(0, &["9999999999 00000 n"])], " \r\n", "trailer");
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("large offset should not be validated against input length");
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
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
        &[(0, &["18446744073709551615 65535 n"])],
        " \r\n",
        "trailer",
    );
    let parsed = parse_classic_xref_table(&input, ByteOffset::new(0))
        .expect("u64::MAX offset and generation 65535 should parse");
    assert_eq!(
        parsed.table().get(ObjectNumber::new(0)),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(u64::MAX),
            generation: GenerationNumber::new(65535),
        })
    );
}
