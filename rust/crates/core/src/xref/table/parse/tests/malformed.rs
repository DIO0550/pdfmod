use super::super::parse_classic_xref_table;
use crate::byte_offset::ByteOffset;
use crate::xref::error::XRefErrorKind;

// 不正なフラグ文字が、実バイトと位置つきで拒否されることを確認する
#[test]
fn invalid_entry_flag_is_rejected_with_actual_byte_and_position() {
    let input = b"xref\n0 1\n0000000017 00000 x \ntrailer";
    let flag_position = input
        .iter()
        .rposition(|&byte| byte == b'x')
        .expect("test input should contain the invalid flag");
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("flag other than n/f should be rejected");
    assert_eq!(error.kind, XRefErrorKind::InvalidEntryFlag { actual: b'x' });
    assert_eq!(error.position, ByteOffset::new(flag_position as u64));
}

// フラグの手前で入力が尽きた場合に UnexpectedEof になることを確認する
#[test]
fn entry_ending_before_flag_is_rejected_as_unexpected_eof() {
    let input = b"xref\n0 1\n0000000017 00000";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("entry without flag should be rejected");
    assert_eq!(error.kind, XRefErrorKind::UnexpectedEof);
}

// 宣言件数に足りないまま入力が尽きた場合に UnexpectedEof になることを確認する
#[test]
fn truncated_subsection_is_rejected_as_unexpected_eof() {
    let input = b"xref\n0 3\n0000000000 65535 f \n0000000017 00000 n \n";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("subsection with fewer entries than declared should be rejected");
    assert_eq!(error.kind, XRefErrorKind::UnexpectedEof);
}

// サブセクションヘッダの件数が欠けている場合に InvalidSubsectionHeader になることを確認する
#[test]
fn subsection_header_without_count_is_rejected() {
    let input = b"xref\n0\ntrailer";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("subsection header without a count should be rejected");
    assert_eq!(error.kind, XRefErrorKind::InvalidSubsectionHeader);
    assert_eq!(error.position, ByteOffset::new(b"xref\n0\n".len() as u64));
}

// 数字の直後に regular バイトが続くフィールドが InvalidNumber で拒否されることを確認する
#[test]
fn number_not_terminated_by_token_boundary_is_rejected() {
    let input = b"xref\n0 1\n000000001a 00000 n \ntrailer";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("digits followed by a regular byte should be rejected");
    assert_eq!(error.kind, XRefErrorKind::InvalidNumber);
    assert_eq!(error.position, ByteOffset::new(b"xref\n0 1\n".len() as u64));
}

// 世代欄が数字でない場合に InvalidNumber で拒否されることを確認する
#[test]
fn generation_field_with_non_digits_is_rejected() {
    let input = b"xref\n0 1\n0000000017 abcde n \ntrailer";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("non-digit generation field should be rejected");
    assert_eq!(error.kind, XRefErrorKind::InvalidNumber);
    assert_eq!(
        error.position,
        ByteOffset::new(b"xref\n0 1\n0000000017 ".len() as u64)
    );
}

// 世代番号の u16 境界（65535 は成功 / 65536 以上は GenerationOutOfRange）を確認する
#[test]
fn generation_above_u16_max_is_rejected() {
    let _ = parse_classic_xref_table(
        b"xref\n0 1\n0000000017 65535 n \ntrailer",
        ByteOffset::new(0),
    )
    .expect("generation 65535 should be accepted");

    let cases: [(&[u8], u64); 2] = [
        (b"xref\n0 1\n0000000017 65536 n \ntrailer", 65536),
        (b"xref\n0 1\n0000000017 99999 n \ntrailer", 99999),
    ];
    for (input, value) in cases {
        let Err(error) = parse_classic_xref_table(input, ByteOffset::new(0)) else {
            panic!("generation {value} should be rejected");
        };
        assert_eq!(error.kind, XRefErrorKind::GenerationOutOfRange { value });
    }
}

// オフセットが u64 を超える（21桁など）場合に InvalidNumber で拒否されることを確認する
#[test]
fn offset_overflowing_u64_is_rejected() {
    let input = b"xref\n0 1\n184467440737095516150 00000 n \ntrailer";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("offset overflowing u64 should be rejected");
    assert_eq!(error.kind, XRefErrorKind::InvalidNumber);
    assert_eq!(error.position, ByteOffset::new(b"xref\n0 1\n".len() as u64));
}

// 先頭番号 + 件数 が u64 を超えるヘッダが InvalidSubsectionHeader で拒否されることを確認する
#[test]
fn subsection_range_overflowing_u64_is_rejected() {
    let input = b"xref\n18446744073709551615 2\n0000000017 00000 n \n";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("object number range overflowing u64 should be rejected");
    assert_eq!(error.kind, XRefErrorKind::InvalidSubsectionHeader);
    assert_eq!(error.position, ByteOffset::new(b"xref\n".len() as u64));
}

// 空入力が MissingXRefKeyword で拒否されることを確認する
#[test]
fn empty_input_is_rejected_as_missing_xref_keyword() {
    let input: &[u8] = b"";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("empty input should be rejected");
    assert_eq!(error.kind, XRefErrorKind::MissingXRefKeyword);
    assert_eq!(error.position, ByteOffset::new(0));
}

// ヘッダが期待される位置に非数字がある場合、サブセクション終端とみなされ空テーブルが返ることを確認する
#[test]
fn non_digit_where_subsection_header_expected_terminates_table() {
    let input = b"xref\nabcdefghij 00000 n \n";
    let parsed = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect("non-digit at subsection start should terminate table parsing");
    assert!(parsed.table().is_empty());
    assert_eq!(parsed.end(), ByteOffset::new(b"xref\n".len() as u64));
}

// テーブル直後が数字で始まる場合、後続エントリ欠落により UnexpectedEof で拒否されることを確認する
#[test]
fn digit_after_table_treated_as_new_subsection_and_fails_on_eof() {
    let input = b"xref\n0 1\n0000000000 65535 f \n123 456";
    let error = parse_classic_xref_table(input, ByteOffset::new(0))
        .expect_err("digit after table treated as subsection and fails on missing entries");
    assert_eq!(error.kind, XRefErrorKind::UnexpectedEof);
}
