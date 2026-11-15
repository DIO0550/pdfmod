//! RFC 1321 の MD5。旧式 PDF の標準セキュリティハンドラとの互換性に限って使い、
//! 衝突耐性が失われているため新規用途には使わない。

use crate::encrypt::block_buffer::BlockBuffer;

const BLOCK_LEN: usize = 64;
pub(super) const DIGEST_LEN: usize = 16;

const INITIAL_STATE: [u32; 4] = [0x6745_2301, 0xefcd_ab89, 0x98ba_dcfe, 0x1032_5476];

const ROTATIONS: [[u32; 4]; 4] = [
    [7, 12, 17, 22],
    [5, 9, 14, 20],
    [4, 11, 16, 23],
    [6, 10, 15, 21],
];

// RFC 1321 §3.4 の各ステップの加算定数。
const STEP_CONSTANTS: [u32; 64] = [
    0xd76a_a478,
    0xe8c7_b756,
    0x2420_70db,
    0xc1bd_ceee,
    0xf57c_0faf,
    0x4787_c62a,
    0xa830_4613,
    0xfd46_9501,
    0x6980_98d8,
    0x8b44_f7af,
    0xffff_5bb1,
    0x895c_d7be,
    0x6b90_1122,
    0xfd98_7193,
    0xa679_438e,
    0x49b4_0821,
    0xf61e_2562,
    0xc040_b340,
    0x265e_5a51,
    0xe9b6_c7aa,
    0xd62f_105d,
    0x0244_1453,
    0xd8a1_e681,
    0xe7d3_fbc8,
    0x21e1_cde6,
    0xc337_07d6,
    0xf4d5_0d87,
    0x455a_14ed,
    0xa9e3_e905,
    0xfcef_a3f8,
    0x676f_02d9,
    0x8d2a_4c8a,
    0xfffa_3942,
    0x8771_f681,
    0x6d9d_6122,
    0xfde5_380c,
    0xa4be_ea44,
    0x4bde_cfa9,
    0xf6bb_4b60,
    0xbebf_bc70,
    0x289b_7ec6,
    0xeaa1_27fa,
    0xd4ef_3085,
    0x0488_1d05,
    0xd9d4_d039,
    0xe6db_99e5,
    0x1fa2_7cf8,
    0xc4ac_5665,
    0xf429_2244,
    0x432a_ff97,
    0xab94_23a7,
    0xfc93_a039,
    0x655b_59c3,
    0x8f0c_cc92,
    0xffef_f47d,
    0x8584_5dd1,
    0x6fa8_7e4f,
    0xfe2c_e6e0,
    0xa301_4314,
    0x4e08_11a1,
    0xf753_7e82,
    0xbd3a_f235,
    0x2ad7_d2bb,
    0xeb86_d391,
];

/// MD5 の逐次計算状態。未処理の末尾はバッファに保持し、入力のバイト数は下位 64 ビットを記録する。
pub(super) struct Md5 {
    state: [u32; 4],
    buffer: BlockBuffer<BLOCK_LEN>,
    byte_len: u64,
}

impl Md5 {
    /// 空の入力から計算を始める。
    pub(super) fn new() -> Self {
        Self {
            state: INITIAL_STATE,
            buffer: BlockBuffer::new(),
            byte_len: 0,
        }
    }

    /// 入力を追加し、そろった 64 バイトのブロックを処理する。
    pub(super) fn update(&mut self, input: &[u8]) {
        // usize が 32 ビットの環境でも、入力長を 64 ビットへゼロ拡張する。
        let len_bytes = input.len().to_le_bytes();
        let mut input_len = [0; size_of::<u64>()];
        input_len[..len_bytes.len()].copy_from_slice(&len_bytes);
        self.byte_len = self.byte_len.wrapping_add(u64::from_le_bytes(input_len));

        self.buffer
            .update(input, |block| Self::compress(&mut self.state, block));
    }

    /// RFC 1321 §3.1–3.2 のパディングと入力長を付け、16 バイトを返す。
    #[must_use]
    pub(super) fn finalize(mut self) -> [u8; DIGEST_LEN] {
        // RFC 1321 §3.2 は入力のビット長の下位 64 ビットをリトルエンディアンで記録する。
        let bit_len = self.byte_len.wrapping_mul(8);
        self.buffer.finalize(bit_len.to_le_bytes(), |block| {
            Self::compress(&mut self.state, block);
        });

        let mut digest = [0; DIGEST_LEN];
        let (output_words, _) = digest.as_chunks_mut::<4>();
        for (output, word) in output_words.iter_mut().zip(self.state) {
            *output = word.to_le_bytes();
        }
        digest
    }

    /// 一続きの入力をヒープ確保なしでハッシュする。
    #[must_use]
    pub(super) fn digest(input: &[u8]) -> [u8; DIGEST_LEN] {
        let mut md5 = Self::new();
        md5.update(input);
        md5.finalize()
    }

    fn compress(state: &mut [u32; 4], block: &[u8; BLOCK_LEN]) {
        let mut words = [0; 16];
        let (word_bytes, _) = block.as_chunks::<4>();
        for (word, &bytes) in words.iter_mut().zip(word_bytes) {
            *word = u32::from_le_bytes(bytes);
        }

        let [mut a, mut b, mut c, mut d] = *state;
        for (step, &constant) in STEP_CONSTANTS.iter().enumerate() {
            let (mixed, word_index) = match step {
                0..=15 => ((b & c) | (!b & d), step),
                16..=31 => ((b & d) | (c & !d), (5 * step + 1) % 16),
                32..=47 => (b ^ c ^ d, (3 * step + 5) % 16),
                _ => (c ^ (b | !d), (7 * step) % 16),
            };

            let rotation = ROTATIONS[step / 16][step % 4];
            let sum = a
                .wrapping_add(mixed)
                .wrapping_add(constant)
                .wrapping_add(words[word_index]);
            (a, b, c, d) = (d, b.wrapping_add(sum.rotate_left(rotation)), b, c);
        }

        for (word, value) in state.iter_mut().zip([a, b, c, d]) {
            *word = word.wrapping_add(value);
        }
    }
}

#[cfg(test)]
mod tests;
