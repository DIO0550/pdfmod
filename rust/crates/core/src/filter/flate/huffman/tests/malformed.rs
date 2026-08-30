use super::*;
use crate::filter::error::FlateErrorKind;

// Kraft の不等式を満たさない過剰な符号長集合が OversubscribedHuffman になることを確認する。
#[test]
fn oversubscribed_lengths_are_rejected() {
    // 1 ビット符号は 2 つまでしか置けない
    let result = HuffmanTable::from_lengths(&[1, 1, 1], ByteOffset::new(3));

    assert_eq!(
        result,
        Err(FlateError::oversubscribed_huffman_at(ByteOffset::new(3)))
    );
}

// 15 を超える符号長が InvalidCodeLength になることを確認する。
#[test]
fn code_length_above_fifteen_is_rejected() {
    let result = HuffmanTable::from_lengths(&[16], ByteOffset::new(3));

    assert_eq!(
        result,
        Err(FlateError::invalid_code_length_at(ByteOffset::new(3), 16))
    );
}

// 符号木が不足している（未使用の符号がある）場合、その符号の復号が InvalidHuffmanCode になることを確認する。
#[test]
fn unused_code_decodes_to_invalid_huffman_code() {
    // 1 ビット符号が 1 つだけ。符号 1 はどのシンボルにも割り当たっていない
    let result = decode_code(&[1], "111111111111111");

    assert!(matches!(
        result,
        Err(FlateError {
            kind: FlateErrorKind::InvalidHuffmanCode,
            ..
        })
    ));
}

// 符号長 0 だけの表（距離符号が 1 つも無いブロック）でも表は作れ、復号は失敗することを確認する。
#[test]
fn empty_table_builds_but_decoding_fails() {
    let table = HuffmanTable::from_lengths(&[], ByteOffset::new(0))
        .expect("empty length list should build an empty table");
    let bytes = [0xFF, 0xFF];
    let mut reader = BitReader::new(&bytes);

    assert!(matches!(
        table.decode(&mut reader),
        Err(FlateError {
            kind: FlateErrorKind::InvalidHuffmanCode,
            ..
        })
    ));
}

// 符号の途中で入力が尽きた場合に UnexpectedEof になることを確認する。
#[test]
fn decoding_past_end_of_input_reports_unexpected_eof() {
    let table = HuffmanTable::from_lengths(&[3, 3, 3, 3, 3, 2, 4, 4], ByteOffset::new(0))
        .expect("rfc example lengths should build");
    let bytes: [u8; 0] = [];
    let mut reader = BitReader::new(&bytes);

    assert!(matches!(
        table.decode(&mut reader),
        Err(FlateError {
            kind: FlateErrorKind::UnexpectedEof,
            ..
        })
    ));
}
