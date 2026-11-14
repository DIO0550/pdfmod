//! 64 ビットワードで計算する SHA-384 / SHA-512（FIPS 180-4 §6.4–6.5）。

use super::block_buffer::BlockBuffer;

const BLOCK_LEN: usize = 128;
const SHA384_DIGEST_LEN: usize = 48;
const SHA512_DIGEST_LEN: usize = 64;
const ROUNDS: usize = 80;

// FIPS 180-4 §5.3.4 の SHA-384 の初期値。
const SHA384_INITIAL_STATE: [u64; 8] = [
    0xcbbb_9d5d_c105_9ed8,
    0x629a_292a_367c_d507,
    0x9159_015a_3070_dd17,
    0x152f_ecd8_f70e_5939,
    0x6733_2667_ffc0_0b31,
    0x8eb4_4a87_6858_1511,
    0xdb0c_2e0d_64f9_8fa7,
    0x47b5_481d_befa_4fa4,
];

// FIPS 180-4 §5.3.5 の SHA-512 の初期値。
const SHA512_INITIAL_STATE: [u64; 8] = [
    0x6a09_e667_f3bc_c908,
    0xbb67_ae85_84ca_a73b,
    0x3c6e_f372_fe94_f82b,
    0xa54f_f53a_5f1d_36f1,
    0x510e_527f_ade6_82d1,
    0x9b05_688c_2b3e_6c1f,
    0x1f83_d9ab_fb41_bd6b,
    0x5be0_cd19_137e_2179,
];

// FIPS 180-4 §4.2.3 のラウンド定数。
const ROUND_CONSTANTS: [u64; ROUNDS] = [
    0x428a_2f98_d728_ae22,
    0x7137_4491_23ef_65cd,
    0xb5c0_fbcf_ec4d_3b2f,
    0xe9b5_dba5_8189_dbbc,
    0x3956_c25b_f348_b538,
    0x59f1_11f1_b605_d019,
    0x923f_82a4_af19_4f9b,
    0xab1c_5ed5_da6d_8118,
    0xd807_aa98_a303_0242,
    0x1283_5b01_4570_6fbe,
    0x2431_85be_4ee4_b28c,
    0x550c_7dc3_d5ff_b4e2,
    0x72be_5d74_f27b_896f,
    0x80de_b1fe_3b16_96b1,
    0x9bdc_06a7_25c7_1235,
    0xc19b_f174_cf69_2694,
    0xe49b_69c1_9ef1_4ad2,
    0xefbe_4786_384f_25e3,
    0x0fc1_9dc6_8b8c_d5b5,
    0x240c_a1cc_77ac_9c65,
    0x2de9_2c6f_592b_0275,
    0x4a74_84aa_6ea6_e483,
    0x5cb0_a9dc_bd41_fbd4,
    0x76f9_88da_8311_53b5,
    0x983e_5152_ee66_dfab,
    0xa831_c66d_2db4_3210,
    0xb003_27c8_98fb_213f,
    0xbf59_7fc7_beef_0ee4,
    0xc6e0_0bf3_3da8_8fc2,
    0xd5a7_9147_930a_a725,
    0x06ca_6351_e003_826f,
    0x1429_2967_0a0e_6e70,
    0x27b7_0a85_46d2_2ffc,
    0x2e1b_2138_5c26_c926,
    0x4d2c_6dfc_5ac4_2aed,
    0x5338_0d13_9d95_b3df,
    0x650a_7354_8baf_63de,
    0x766a_0abb_3c77_b2a8,
    0x81c2_c92e_47ed_aee6,
    0x9272_2c85_1482_353b,
    0xa2bf_e8a1_4cf1_0364,
    0xa81a_664b_bc42_3001,
    0xc24b_8b70_d0f8_9791,
    0xc76c_51a3_0654_be30,
    0xd192_e819_d6ef_5218,
    0xd699_0624_5565_a910,
    0xf40e_3585_5771_202a,
    0x106a_a070_32bb_d1b8,
    0x19a4_c116_b8d2_d0c8,
    0x1e37_6c08_5141_ab53,
    0x2748_774c_df8e_eb99,
    0x34b0_bcb5_e19b_48a8,
    0x391c_0cb3_c5c9_5a63,
    0x4ed8_aa4a_e341_8acb,
    0x5b9c_ca4f_7763_e373,
    0x682e_6ff3_d6b2_b8a3,
    0x748f_82ee_5def_b2fc,
    0x78a5_636f_4317_2f60,
    0x84c8_7814_a1f0_ab72,
    0x8cc7_0208_1a64_39ec,
    0x90be_fffa_2363_1e28,
    0xa450_6ceb_de82_bde9,
    0xbef9_a3f7_b2c6_7915,
    0xc671_78f2_e372_532b,
    0xca27_3ece_ea26_619c,
    0xd186_b8c7_21c0_c207,
    0xeada_7dd6_cde0_eb1e,
    0xf57d_4f7f_ee6e_d178,
    0x06f0_67aa_7217_6fba,
    0x0a63_7dc5_a2c8_98a6,
    0x113f_9804_bef9_0dae,
    0x1b71_0b35_131c_471b,
    0x28db_77f5_2304_7d84,
    0x32ca_ab7b_40c7_2493,
    0x3c9e_be0a_15c9_bebc,
    0x431d_67c4_9c10_0d4c,
    0x4cc5_d4be_cb3e_42b6,
    0x597f_299c_fc65_7e2a,
    0x5fcb_6fab_3ad6_faec,
    0x6c44_198c_4a47_5817,
];

/// SHA-384 の逐次計算状態。専用の初期値から開始し、最終状態の先頭 6 ワードを出力する。
pub(in crate::encrypt) struct Sha384(Sha512State);

impl Sha384 {
    /// SHA-384 の初期値から計算を始める。
    pub(in crate::encrypt) fn new() -> Self {
        Self(Sha512State::new(SHA384_INITIAL_STATE))
    }

    /// 入力を追加する。合計ビット長が 2^128 以上になると、状態を維持して `None` を返す。
    #[must_use]
    pub(in crate::encrypt) fn update(&mut self, input: &[u8]) -> Option<()> {
        self.0.update(input)
    }

    /// パディングを処理し、先頭 6 ワードをビッグエンディアンの 48 バイトで返す。
    #[must_use]
    pub(in crate::encrypt) fn finalize(self) -> [u8; SHA384_DIGEST_LEN] {
        self.0.finalize()
    }

    /// 一続きの入力をヒープ確保なしでハッシュする。ビット長が 2^128 以上なら `None`。
    #[must_use]
    pub(in crate::encrypt) fn digest(input: &[u8]) -> Option<[u8; SHA384_DIGEST_LEN]> {
        let mut sha = Self::new();
        sha.update(input)?;
        Some(sha.finalize())
    }
}

/// SHA-512 の逐次計算状態。専用の初期値から開始し、最終状態の全 8 ワードを出力する。
pub(in crate::encrypt) struct Sha512(Sha512State);

impl Sha512 {
    /// SHA-512 の初期値から計算を始める。
    pub(in crate::encrypt) fn new() -> Self {
        Self(Sha512State::new(SHA512_INITIAL_STATE))
    }

    /// 入力を追加する。合計ビット長が 2^128 以上になると、状態を維持して `None` を返す。
    #[must_use]
    pub(in crate::encrypt) fn update(&mut self, input: &[u8]) -> Option<()> {
        self.0.update(input)
    }

    /// パディングを処理し、8 ワードをビッグエンディアンの 64 バイトで返す。
    #[must_use]
    pub(in crate::encrypt) fn finalize(self) -> [u8; SHA512_DIGEST_LEN] {
        self.0.finalize()
    }

    /// 一続きの入力をヒープ確保なしでハッシュする。ビット長が 2^128 以上なら `None`。
    #[must_use]
    pub(in crate::encrypt) fn digest(input: &[u8]) -> Option<[u8; SHA512_DIGEST_LEN]> {
        let mut sha = Self::new();
        sha.update(input)?;
        Some(sha.finalize())
    }
}

/// 128 ビットで入力のビット長を保持し、SHA-384 と SHA-512 の圧縮処理を共有する。
struct Sha512State {
    state: [u64; 8],
    buffer: BlockBuffer<BLOCK_LEN>,
    bit_len: u128,
}

impl Sha512State {
    fn new(initial_state: [u64; 8]) -> Self {
        Self {
            state: initial_state,
            buffer: BlockBuffer::new(),
            bit_len: 0,
        }
    }

    fn update(&mut self, input: &[u8]) -> Option<()> {
        let input_bits = u128::try_from(input.len()).ok()?.checked_mul(8)?;
        self.bit_len = self.bit_len.checked_add(input_bits)?;

        self.buffer
            .update(input, |block| Self::compress(&mut self.state, block));
        Some(())
    }

    fn finalize<const DIGEST_LEN: usize>(mut self) -> [u8; DIGEST_LEN] {
        const { assert!(matches!(DIGEST_LEN, SHA384_DIGEST_LEN | SHA512_DIGEST_LEN)) };

        self.buffer.finalize(self.bit_len.to_be_bytes(), |block| {
            Self::compress(&mut self.state, block);
        });

        let mut digest = [0; DIGEST_LEN];
        let (output_words, _) = digest.as_chunks_mut::<8>();
        for (output, word) in output_words.iter_mut().zip(self.state) {
            *output = word.to_be_bytes();
        }
        digest
    }

    fn message_schedule(block: &[u8; BLOCK_LEN]) -> [u64; ROUNDS] {
        let mut words = [0; ROUNDS];
        let (word_bytes, _) = block.as_chunks::<8>();
        for (word, &bytes) in words.iter_mut().zip(word_bytes) {
            *word = u64::from_be_bytes(bytes);
        }

        for index in word_bytes.len()..ROUNDS {
            let w15 = words[index - 15];
            let w2 = words[index - 2];
            let sigma0 = w15.rotate_right(1) ^ w15.rotate_right(8) ^ (w15 >> 7);
            let sigma1 = w2.rotate_right(19) ^ w2.rotate_right(61) ^ (w2 >> 6);
            words[index] = words[index - 16]
                .wrapping_add(sigma0)
                .wrapping_add(words[index - 7])
                .wrapping_add(sigma1);
        }
        words
    }

    fn compress(state: &mut [u64; 8], block: &[u8; BLOCK_LEN]) {
        let words = Self::message_schedule(block);
        let [mut a, mut b, mut c, mut d, mut e, mut f, mut g, mut h] = *state;

        for (&word, &constant) in words.iter().zip(&ROUND_CONSTANTS) {
            let sum1 = e.rotate_right(14) ^ e.rotate_right(18) ^ e.rotate_right(41);
            let choose = (e & f) ^ (!e & g);
            let t1 = h
                .wrapping_add(sum1)
                .wrapping_add(choose)
                .wrapping_add(constant)
                .wrapping_add(word);

            let sum0 = a.rotate_right(28) ^ a.rotate_right(34) ^ a.rotate_right(39);
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
    use super::{Sha512, BLOCK_LEN};

    #[test]
    fn rejects_updates_past_the_128_bit_length_field() {
        let mut sha = Sha512::new();
        sha.update(&[0; BLOCK_LEN - 2]).unwrap();
        sha.0.bit_len = u128::MAX - 15;

        assert_eq!(sha.update(b"ab"), None);
        assert_eq!(sha.0.bit_len, u128::MAX - 15);
        assert_eq!(sha.update(b"a"), Some(()));
        assert_eq!(sha.update(b"b"), None);
        assert_eq!(sha.0.bit_len, u128::MAX - 7);
    }
}
