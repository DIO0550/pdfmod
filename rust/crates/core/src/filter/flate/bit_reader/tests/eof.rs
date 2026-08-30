use super::super::*;
use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateErrorKind;

// 空入力に対する read_bit が位置 0 の UnexpectedEof になることを確認する。
#[test]
fn read_bit_on_empty_input_reports_unexpected_eof_at_start() {
    let mut reader = BitReader::new(&[]);

    assert_eq!(
        reader.read_bit(),
        Err(FlateError::unexpected_eof_at(ByteOffset::new(0)))
    );
}

// 残りビット数を超える read_bits が UnexpectedEof になることを確認する。
#[test]
fn read_bits_beyond_input_reports_unexpected_eof() {
    let mut reader = BitReader::new(&[0xFF]);
    assert_eq!(reader.read_bits(4), Ok(0b1111));

    let result = reader.read_bits(8);

    assert!(matches!(
        result,
        Err(FlateError {
            kind: FlateErrorKind::UnexpectedEof,
            ..
        })
    ));
}

// take_bytes が指定バイト数を切り出し、位置を進めることを確認する。
#[test]
fn take_bytes_returns_requested_slice_and_advances() {
    let mut reader = BitReader::new(&[0x78, 0x01, 0xAB]);

    assert_eq!(reader.take_bytes(2), Ok(&[0x78, 0x01][..]));
    assert_eq!(reader.position(), ByteOffset::new(2));
}

// 範囲を超える take_bytes が UnexpectedEof になり、位置を進めないことを確認する。
#[test]
fn take_bytes_beyond_input_reports_eof_without_advancing() {
    let mut reader = BitReader::new(&[0x78, 0x01]);

    assert_eq!(
        reader.take_bytes(3),
        Err(FlateError::unexpected_eof_at(ByteOffset::new(0)))
    );
    assert_eq!(reader.position(), ByteOffset::new(0));
}

// 長さ 0 の take_bytes が空スライスを返し、位置を進めないことを確認する。
#[test]
fn take_bytes_with_zero_length_returns_empty_slice() {
    let mut reader = BitReader::new(&[0x78]);

    assert_eq!(reader.take_bytes(0), Ok(&[][..]));
    assert_eq!(reader.position(), ByteOffset::new(0));
}

// usize をオーバーフローする長さの take_bytes でも panic せず UnexpectedEof になることを確認する。
#[test]
fn take_bytes_with_overflowing_length_reports_eof() {
    let mut reader = BitReader::new(&[0x78]);

    assert_eq!(
        reader.take_bytes(usize::MAX),
        Err(FlateError::unexpected_eof_at(ByteOffset::new(0)))
    );
}
