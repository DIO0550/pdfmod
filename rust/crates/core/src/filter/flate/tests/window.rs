use super::*;
use crate::filter::flate::adler32::Adler32;

/// 線形合同法で再現性のあるバイト列を作る（圧縮しづらい入力を用意するため）。
fn pseudo_random_bytes(len: usize) -> Vec<u8> {
    let mut state = 1_u32;
    (0..len)
        .map(|_| {
            state = state.wrapping_mul(1_103_515_245).wrapping_add(12_345);
            u8::try_from((state >> 16) & 0xFF).unwrap_or(0)
        })
        .collect()
}

/// DEFLATE 本体に zlib ヘッダと Adler-32 トレーラを付ける。
fn wrap_zlib(deflate: &[u8], expected: &[u8]) -> Vec<u8> {
    let mut checksum = Adler32::new();
    checksum.update(expected);

    let mut stream = vec![0x78, 0x01];
    stream.extend_from_slice(deflate);
    stream.extend_from_slice(&checksum.value().to_be_bytes());
    stream
}

// ウィンドウ全長（距離 32768）の後方参照を含む 32KB 超のストリームが復元されることを確認する。
#[test]
fn back_reference_at_full_window_distance_round_trips() {
    let data = pseudo_random_bytes(32768);

    // 非圧縮ブロック（BFINAL=0 / LEN=32768）で 32768 バイトを置き、
    // 続く固定 Huffman ブロックで距離 32768・長さ 258 の後方参照だけを出す。
    // 1B BD FF 1F 00: 長さシンボル 285 + 距離シンボル 29 + 追加ビット 8191 + ブロック終端
    let mut deflate = vec![0x00, 0x00, 0x80, 0xFF, 0x7F];
    deflate.extend_from_slice(&data);
    deflate.extend_from_slice(&[0x1B, 0xBD, 0xFF, 0x1F, 0x00]);

    let mut expected = data.clone();
    expected.extend_from_slice(data.get(..258).unwrap_or(&[]));
    let stream = wrap_zlib(&deflate, &expected);

    assert_eq!(decode_zlib_ok(&stream), expected);
}
