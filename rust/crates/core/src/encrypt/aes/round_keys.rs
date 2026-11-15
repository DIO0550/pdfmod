//! FIPS 197 §5.2 の鍵拡張。1 ワードは 4 バイト、1 ラウンド鍵は 4 ワード。

use super::byte::{double, substitute};
use super::{KEY_128_LEN, KEY_256_LEN};

pub(super) const WORD_LEN: usize = 4;
const WORDS_PER_ROUND: usize = 4;
const ROUND_KEYS_128: usize = 11;
const ROUND_KEYS_256: usize = 15;
pub(super) type RoundKey = [u32; WORDS_PER_ROUND];

enum ExpandedKeys {
    Aes128([RoundKey; ROUND_KEYS_128]),
    Aes256([RoundKey; ROUND_KEYS_256]),
}

/// 初回の鍵に加え、AES-128 では 10、AES-256 では 14 ラウンド分の鍵を持つ。
pub(super) struct RoundKeys(ExpandedKeys);

impl RoundKeys {
    pub(super) fn new_128(key: &[u8; KEY_128_LEN]) -> Self {
        let mut rounds = [[0; WORDS_PER_ROUND]; ROUND_KEYS_128];
        Self::expand(rounds.as_flattened_mut(), key.as_chunks::<WORD_LEN>().0);
        Self(ExpandedKeys::Aes128(rounds))
    }

    pub(super) fn new_256(key: &[u8; KEY_256_LEN]) -> Self {
        let mut rounds = [[0; WORDS_PER_ROUND]; ROUND_KEYS_256];
        Self::expand(rounds.as_flattened_mut(), key.as_chunks::<WORD_LEN>().0);
        Self(ExpandedKeys::Aes256(rounds))
    }

    /// 最初と最後の鍵を分け、個数の異なる中間ラウンド鍵をスライスとして返す。
    pub(super) fn split(&self) -> (&RoundKey, &[RoundKey], &RoundKey) {
        match &self.0 {
            ExpandedKeys::Aes128([first, middle @ .., last]) => (first, middle, last),
            ExpandedKeys::Aes256([first, middle @ .., last]) => (first, middle, last),
        }
    }

    fn expand(words: &mut [u32], key_words: &[[u8; WORD_LEN]]) {
        for (word, key_word) in words.iter_mut().zip(key_words) {
            *word = u32::from_be_bytes(*key_word);
        }

        // 呼び出し元が 4 または 8 ワードの鍵を渡す。過去のワードは必ず計算済み。
        let key_word_count = key_words.len();
        let mut round_constant = 1;
        for index in key_word_count..words.len() {
            let mut previous = words[index - 1];
            let position = index % key_word_count;
            if position == 0 {
                previous =
                    Self::sub_word(previous.rotate_left(8)) ^ (u32::from(round_constant) << 24);
                round_constant = double(round_constant);
            } else if key_word_count == KEY_256_LEN / WORD_LEN && position == 4 {
                previous = Self::sub_word(previous);
            }

            words[index] = words[index - key_word_count] ^ previous;
        }
    }

    fn sub_word(word: u32) -> u32 {
        u32::from_be_bytes(word.to_be_bytes().map(substitute))
    }
}
