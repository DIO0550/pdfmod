use super::super::*;
use crate::byte_offset::ByteOffset;

// 1 バイトを 1 ビットずつ読むと、最下位ビットから順に返ることを確認する（RFC 1951 §3.1.1）。
#[test]
fn read_bit_returns_bits_from_least_significant_first() {
    // 0b1010_0101 を下位ビットから読むと 1,0,1,0,0,1,0,1 の順になる
    let mut reader = BitReader::new(&[0b1010_0101]);

    for expected in [1, 0, 1, 0, 0, 1, 0, 1] {
        assert_eq!(reader.read_bit(), Ok(expected), "bit should be {expected}");
    }
}

// 3 ビットまとめ読みで、先に読んだビットが結果の下位に来ることを確認する。
#[test]
fn read_bits_places_first_bit_in_least_significant_position() {
    // 0b0000_0101: 下位から 1,0,1 → 0b101 = 5
    let mut reader = BitReader::new(&[0b0000_0101]);

    assert_eq!(reader.read_bits(3), Ok(0b101));
}

// バイトをまたぐ読み出しで、次のバイトの下位ビットが続きとして連結されることを確認する。
#[test]
fn read_bits_continues_into_next_byte() {
    // 1 バイト目の上位 3 ビット（0b101）に続けて 2 バイト目の下位 3 ビット（0b110）を読む
    let mut reader = BitReader::new(&[0b1010_0000, 0b0000_0110]);
    assert_eq!(reader.read_bits(5), Ok(0));

    // 上位 3 ビット 101 が下位に、次バイトの 110 がその上に載る → 0b110_101
    assert_eq!(reader.read_bits(6), Ok(0b110_101));
}

// 0 ビットの読み出しが位置を進めず 0 を返すことを確認する（追加ビット数 0 の長さシンボル）。
#[test]
fn read_bits_with_zero_count_returns_zero_without_advancing() {
    let mut reader = BitReader::new(&[0xFF]);

    assert_eq!(reader.read_bits(0), Ok(0));
    assert_eq!(reader.position(), ByteOffset::new(0));
    assert_eq!(reader.read_bit(), Ok(1));
}

// 16 ビットの読み出しで 2 バイトがリトルエンディアン相当に連結されることを確認する。
#[test]
fn read_bits_with_sixteen_count_joins_two_bytes() {
    let mut reader = BitReader::new(&[0x34, 0x12]);

    assert_eq!(reader.read_bits(16), Ok(0x1234));
}

// position が読み進めたバイト数（ビット数を 8 で割った商）を返すことを確認する。
#[test]
fn position_returns_byte_offset_of_current_bit() {
    let mut reader = BitReader::new(&[0x00, 0x00, 0x00]);

    assert_eq!(reader.position(), ByteOffset::new(0));
    assert_eq!(reader.read_bits(8), Ok(0));
    assert_eq!(reader.position(), ByteOffset::new(1));
    assert_eq!(reader.read_bits(3), Ok(0));
    assert_eq!(reader.position(), ByteOffset::new(1));
    assert_eq!(reader.read_bits(5), Ok(0));
    assert_eq!(reader.position(), ByteOffset::new(2));
}

// read_u16_le がバイト境界から 2 バイトをリトルエンディアンとして読むことを確認する。
#[test]
fn read_u16_le_joins_two_bytes_little_endian() {
    let mut reader = BitReader::new(&[0x34, 0x12, 0xFF]);

    assert_eq!(reader.read_u16_le(), Ok(0x1234));
    assert_eq!(reader.position(), ByteOffset::new(2));
}

// 2 バイトに満たない入力で read_u16_le が UnexpectedEof になることを確認する。
#[test]
fn read_u16_le_on_truncated_input_reports_unexpected_eof() {
    let mut reader = BitReader::new(&[0x34]);

    assert_eq!(
        reader.read_u16_le(),
        Err(FlateError::unexpected_eof_at(ByteOffset::new(0)))
    );
}
