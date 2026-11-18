//! FIPS 197 §5.1・§5.3 の順変換と逆変換で 1 ブロックを処理する。

use super::byte::{double, inverse_substitute, substitute};
use super::round_keys::{RoundKey, RoundKeys, WORD_LEN};
use super::Block;

/// AES の状態。連続する 4 バイトが 4 行 × 4 列のうちの 1 列を表す。
pub(super) struct BlockState(Block);

impl BlockState {
    pub(super) fn encrypt(plaintext: Block, round_keys: &RoundKeys) -> Block {
        let (first, middle, last) = round_keys.split();
        let mut state = Self(plaintext);
        state.add_round_key(first);

        for key in middle {
            state.0 = state.0.map(substitute);
            state.shift_rows();
            state.mix_columns();
            state.add_round_key(key);
        }

        state.0 = state.0.map(substitute);
        state.shift_rows();
        state.add_round_key(last);
        state.0
    }

    /// 暗号化の末尾から先頭へ、ラウンド鍵を逆順に使う。
    pub(super) fn decrypt(ciphertext: Block, round_keys: &RoundKeys) -> Block {
        let (first, middle, last) = round_keys.split();
        let mut state = Self(ciphertext);
        state.add_round_key(last);

        for key in middle.iter().rev() {
            state.inv_shift_rows();
            state.inv_sub_bytes();
            state.add_round_key(key);
            state.inv_mix_columns();
        }

        state.inv_shift_rows();
        state.inv_sub_bytes();
        state.add_round_key(first);
        state.0
    }

    fn add_round_key(&mut self, key: &RoundKey) {
        let (columns, _) = self.0.as_chunks_mut::<WORD_LEN>();
        for (column, word) in columns.iter_mut().zip(key) {
            for (byte, key_byte) in column.iter_mut().zip(word.to_be_bytes()) {
                *byte ^= key_byte;
            }
        }
    }

    fn shift_rows(&mut self) {
        self.0 = std::array::from_fn(|index| {
            let row = index % WORD_LEN;
            let column = index / WORD_LEN;
            let source_column = (column + row) % WORD_LEN;
            self.0[source_column * WORD_LEN + row]
        });
    }

    fn inv_shift_rows(&mut self) {
        // 行 r を右へ r 列分戻す。各出力位置から移動前の列を求める。
        self.0 = std::array::from_fn(|index| {
            let row = index % WORD_LEN;
            let column = index / WORD_LEN;
            let source_column = (column + WORD_LEN - row) % WORD_LEN;
            self.0[source_column * WORD_LEN + row]
        });
    }

    fn inv_sub_bytes(&mut self) {
        self.0 = self.0.map(inverse_substitute);
    }

    fn inv_mix_columns(&mut self) {
        let (columns, _) = self.0.as_chunks_mut::<WORD_LEN>();
        for column in columns {
            let [a, b, c, d] = *column;
            // 対向する行の差を 4 倍して補正し、通常の MixColumns を適用すると逆行列になる。
            let even = double(double(a ^ c));
            let odd = double(double(b ^ d));
            *column = [a ^ even, b ^ odd, c ^ even, d ^ odd];
        }
        self.mix_columns();
    }

    fn mix_columns(&mut self) {
        let (columns, _) = self.0.as_chunks_mut::<WORD_LEN>();
        for column in columns {
            let [a, b, c, d] = *column;
            let sum = a ^ b ^ c ^ d;

            *column = [
                a ^ sum ^ double(a ^ b),
                b ^ sum ^ double(b ^ c),
                c ^ sum ^ double(c ^ d),
                d ^ sum ^ double(d ^ a),
            ];
        }
    }
}
