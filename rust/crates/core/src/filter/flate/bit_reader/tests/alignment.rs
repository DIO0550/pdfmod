use super::super::*;
use crate::byte_offset::ByteOffset;

// 既にバイト境界にいる場合、align_to_byte が位置を動かさないことを確認する。
#[test]
fn align_to_byte_on_boundary_keeps_position() {
    let mut reader = BitReader::new(&[0xFF, 0x0F]);
    assert_eq!(reader.read_bits(8), Ok(0xFF));

    reader.align_to_byte();

    assert_eq!(reader.position(), ByteOffset::new(1));
    assert_eq!(reader.read_bits(4), Ok(0x0F));
}

// バイトの途中にいる場合、align_to_byte が次のバイト先頭へ切り上げることを確認する。
#[test]
fn align_to_byte_off_boundary_moves_to_next_byte() {
    let mut reader = BitReader::new(&[0xFF, 0xA5]);
    assert_eq!(reader.read_bits(3), Ok(0b111));

    reader.align_to_byte();

    assert_eq!(reader.position(), ByteOffset::new(1));
    assert_eq!(reader.read_bits(8), Ok(0xA5));
}

// 先頭から 1 ビットも読んでいない状態でも align_to_byte が位置を動かさないことを確認する。
#[test]
fn align_to_byte_at_start_keeps_position() {
    let mut reader = BitReader::new(&[0xA5]);

    reader.align_to_byte();

    assert_eq!(reader.position(), ByteOffset::new(0));
}
