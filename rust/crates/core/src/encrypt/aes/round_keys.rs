//! FIPS 197 §5.2 の鍵拡張。1 ワードは 4 バイト、1 ラウンド鍵は 4 ワード。

use super::byte::{double, substitute_word};
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
        let [first, remaining @ ..] = &mut rounds;
        let (key_words, _) = key.as_chunks::<WORD_LEN>();
        for (word, bytes) in first.iter_mut().zip(key_words) {
            *word = u32::from_be_bytes(*bytes);
        }

        let mut previous = *first;
        let mut round_constant = 1;
        for next in remaining {
            *next = Self::expand_with_round_constant(previous, &previous, &mut round_constant);
            previous = *next;
        }

        Self(ExpandedKeys::Aes128(rounds))
    }

    pub(super) fn new_256(key: &[u8; KEY_256_LEN]) -> Self {
        let mut rounds = [[0; WORDS_PER_ROUND]; ROUND_KEYS_256];
        let [first, second, middle @ .., last] = &mut rounds;
        let (key_words, _) = key.as_chunks::<WORD_LEN>();
        for (word, bytes) in first.iter_mut().chain(second.iter_mut()).zip(key_words) {
            *word = u32::from_be_bytes(*bytes);
        }

        let mut older = *first;
        let mut previous = *second;
        let mut round_constant = 1;
        // AES-256 はラウンド定数を使う鍵と、SubWord だけを使う鍵を交互に作る。
        let (pairs, _) = middle.as_chunks_mut::<2>();
        for [even, odd] in pairs {
            *even = Self::expand_with_round_constant(older, &previous, &mut round_constant);
            let [.., last_word] = *even;
            *odd = Self::xor_chain(previous, substitute_word(last_word));

            older = *even;
            previous = *odd;
        }
        *last = Self::expand_with_round_constant(older, &previous, &mut round_constant);

        Self(ExpandedKeys::Aes256(rounds))
    }

    /// 最初と最後の鍵を分け、個数の異なる中間ラウンド鍵をスライスとして返す。
    pub(super) fn split(&self) -> (&RoundKey, &[RoundKey], &RoundKey) {
        match &self.0 {
            ExpandedKeys::Aes128([first, middle @ .., last]) => (first, middle, last),
            ExpandedKeys::Aes256([first, middle @ .., last]) => (first, middle, last),
        }
    }

    fn expand_with_round_constant(
        base: RoundKey,
        previous: &RoundKey,
        round_constant: &mut u8,
    ) -> RoundKey {
        let [.., last_word] = *previous;
        let transformed =
            substitute_word(last_word.rotate_left(8)) ^ (u32::from(*round_constant) << 24);
        *round_constant = double(*round_constant);
        Self::xor_chain(base, transformed)
    }

    fn xor_chain(mut base: RoundKey, mut previous_word: u32) -> RoundKey {
        for word in &mut base {
            *word ^= previous_word;
            previous_word = *word;
        }
        base
    }
}
