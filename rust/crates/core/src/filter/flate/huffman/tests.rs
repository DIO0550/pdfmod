use super::*;

mod build;
mod decode;
mod malformed;

// Huffman 符号のビット列（読む順に並べた '0' / '1'）を、BitReader が読めるバイト列に詰める。
//
// Huffman 符号は上位ビットから並ぶが、BitReader は各バイトの最下位ビットから読む。
// 先頭の文字が最初に読まれるよう、各バイトの下位ビットから順に埋める。
fn pack_bits(code: &str) -> Vec<u8> {
    let mut bytes = vec![0_u8; code.len().div_ceil(8)];
    for (index, bit) in code.chars().enumerate() {
        if bit == '1' {
            if let Some(byte) = bytes.get_mut(index / 8) {
                *byte |= 1 << (index % 8);
            }
        }
    }
    bytes
}

// 符号長配列から表を作り、ビット列を 1 シンボル復号する。
fn decode_code(lengths: &[u8], code: &str) -> Result<u16, FlateError> {
    let table = HuffmanTable::from_lengths(lengths, ByteOffset::new(0))
        .expect("code lengths should form a valid table");
    let bytes = pack_bits(code);
    let mut reader = BitReader::new(&bytes);
    table.decode(&mut reader)
}
