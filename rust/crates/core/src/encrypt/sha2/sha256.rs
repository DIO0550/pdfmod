//! 32 ビットワードで計算する SHA-256（FIPS 180-4 §6.2）。

use super::block_buffer::BlockBuffer;

const BLOCK_LEN: usize = 64;
const DIGEST_LEN: usize = 32;
const ROUNDS: usize = 64;

// FIPS 180-4 §5.3.3 の初期値。
const INITIAL_STATE: [u32; 8] = [
    0x6a09_e667,
    0xbb67_ae85,
    0x3c6e_f372,
    0xa54f_f53a,
    0x510e_527f,
    0x9b05_688c,
    0x1f83_d9ab,
    0x5be0_cd19,
];

// FIPS 180-4 §4.2.2 のラウンド定数。
const ROUND_CONSTANTS: [u32; ROUNDS] = [
    0x428a_2f98,
    0x7137_4491,
    0xb5c0_fbcf,
    0xe9b5_dba5,
    0x3956_c25b,
    0x59f1_11f1,
    0x923f_82a4,
    0xab1c_5ed5,
    0xd807_aa98,
    0x1283_5b01,
    0x2431_85be,
    0x550c_7dc3,
    0x72be_5d74,
    0x80de_b1fe,
    0x9bdc_06a7,
    0xc19b_f174,
    0xe49b_69c1,
    0xefbe_4786,
    0x0fc1_9dc6,
    0x240c_a1cc,
    0x2de9_2c6f,
    0x4a74_84aa,
    0x5cb0_a9dc,
    0x76f9_88da,
    0x983e_5152,
    0xa831_c66d,
    0xb003_27c8,
    0xbf59_7fc7,
    0xc6e0_0bf3,
    0xd5a7_9147,
    0x06ca_6351,
    0x1429_2967,
    0x27b7_0a85,
    0x2e1b_2138,
    0x4d2c_6dfc,
    0x5338_0d13,
    0x650a_7354,
    0x766a_0abb,
    0x81c2_c92e,
    0x9272_2c85,
    0xa2bf_e8a1,
    0xa81a_664b,
    0xc24b_8b70,
    0xc76c_51a3,
    0xd192_e819,
    0xd699_0624,
    0xf40e_3585,
    0x106a_a070,
    0x19a4_c116,
    0x1e37_6c08,
    0x2748_774c,
    0x34b0_bcb5,
    0x391c_0cb3,
    0x4ed8_aa4a,
    0x5b9c_ca4f,
    0x682e_6ff3,
    0x748f_82ee,
    0x78a5_636f,
    0x84c8_7814,
    0x8cc7_0208,
    0x90be_fffa,
    0xa450_6ceb,
    0xbef9_a3f7,
    0xc671_78f2,
];

/// SHA-256 の逐次計算状態。入力のビット長は 64 ビット以内で、末尾はバッファに保持する。
pub(in crate::encrypt) struct Sha256 {
    state: [u32; 8],
    buffer: BlockBuffer<BLOCK_LEN>,
    bit_len: u64,
}

impl Sha256 {
    /// SHA-256 の初期値から計算を始める。
    pub(in crate::encrypt) fn new() -> Self {
        Self {
            state: INITIAL_STATE,
            buffer: BlockBuffer::new(),
            bit_len: 0,
        }
    }

    /// 入力を追加する。合計ビット長が 2^64 以上になると、状態を維持して `None` を返す。
    pub(in crate::encrypt) fn update(&mut self, input: &[u8]) -> Option<()> {
        let input_bits = u64::try_from(input.len()).ok()?.checked_mul(8)?;
        self.bit_len = self.bit_len.checked_add(input_bits)?;

        self.buffer
            .update(input, |block| Self::compress(&mut self.state, block));
        Some(())
    }

    /// パディングを処理し、8 ワードをビッグエンディアンの 32 バイトで返す。
    #[must_use]
    pub(in crate::encrypt) fn finalize(mut self) -> [u8; DIGEST_LEN] {
        self.buffer.finalize(self.bit_len.to_be_bytes(), |block| {
            Self::compress(&mut self.state, block);
        });

        let mut digest = [0; DIGEST_LEN];
        let (output_words, _) = digest.as_chunks_mut::<4>();
        for (output, word) in output_words.iter_mut().zip(self.state) {
            *output = word.to_be_bytes();
        }
        digest
    }

    /// 一続きの入力をヒープ確保なしでハッシュする。ビット長が 2^64 以上なら `None`。
    pub(in crate::encrypt) fn digest(input: &[u8]) -> Option<[u8; DIGEST_LEN]> {
        let mut sha = Self::new();
        sha.update(input)?;
        Some(sha.finalize())
    }

    fn message_schedule(block: &[u8; BLOCK_LEN]) -> [u32; ROUNDS] {
        let mut words = [0; ROUNDS];
        let (word_bytes, _) = block.as_chunks::<4>();
        for (word, &bytes) in words.iter_mut().zip(word_bytes) {
            *word = u32::from_be_bytes(bytes);
        }

        for index in word_bytes.len()..ROUNDS {
            let w15 = words[index - 15];
            let w2 = words[index - 2];
            let sigma0 = w15.rotate_right(7) ^ w15.rotate_right(18) ^ (w15 >> 3);
            let sigma1 = w2.rotate_right(17) ^ w2.rotate_right(19) ^ (w2 >> 10);
            words[index] = words[index - 16]
                .wrapping_add(sigma0)
                .wrapping_add(words[index - 7])
                .wrapping_add(sigma1);
        }
        words
    }

    fn compress(state: &mut [u32; 8], block: &[u8; BLOCK_LEN]) {
        let words = Self::message_schedule(block);
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;

        for (&word, &constant) in words.iter().zip(&ROUND_CONSTANTS) {
            let sum1 = e.rotate_right(6) ^ e.rotate_right(11) ^ e.rotate_right(25);
            let choose = (e & f) ^ (!e & g);
            let t1 = h
                .wrapping_add(sum1)
                .wrapping_add(choose)
                .wrapping_add(constant)
                .wrapping_add(word);

            let sum0 = a.rotate_right(2) ^ a.rotate_right(13) ^ a.rotate_right(22);
            let majority = (a & b) ^ (a & c) ^ (b & c);
            let t2 = sum0.wrapping_add(majority);

            (a, b, c, d, e, f, g, h) = (t1.wrapping_add(t2), a, b, c, d.wrapping_add(t1), e, f, g);
        }

        for (word, value) in state.iter_mut().zip([a, b, c, d, e, f, g, h]) {
            *word = word.wrapping_add(value);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{Sha256, BLOCK_LEN};

    #[test]
    fn rejects_updates_past_the_64_bit_length_field() {
        let mut sha = Sha256::new();
        sha.update(&[0; BLOCK_LEN - 2]).unwrap();
        sha.bit_len = u64::MAX - 15;

        assert_eq!(sha.update(b"ab"), None);
        assert_eq!(sha.bit_len, u64::MAX - 15);
        assert_eq!(sha.update(b"a"), Some(()));
        assert_eq!(sha.update(b"b"), None);
        assert_eq!(sha.bit_len, u64::MAX - 7);
    }
}
