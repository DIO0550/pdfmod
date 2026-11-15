//! FIPS 197 の AES-128 / AES-256 を使った PDF 復号のための内部実装。

mod block;
mod byte;
mod round_keys;

use self::block::BlockState;
use self::round_keys::RoundKeys;

const BLOCK_LEN: usize = 16;
const KEY_128_LEN: usize = 16;
const KEY_256_LEN: usize = 32;
type Block = [u8; BLOCK_LEN];

/// 128 ビットまたは 256 ビットの鍵から拡張したラウンド鍵を保持する。
pub(super) struct Aes {
    round_keys: RoundKeys,
}

impl Aes {
    /// AES-128 の鍵を拡張する。
    pub(super) fn new_128(key: &[u8; KEY_128_LEN]) -> Self {
        Self {
            round_keys: RoundKeys::new_128(key),
        }
    }

    /// AES-256 の鍵を拡張する。
    pub(super) fn new_256(key: &[u8; KEY_256_LEN]) -> Self {
        Self {
            round_keys: RoundKeys::new_256(key),
        }
    }

    /// `/Perms` など、IV とパディングを持たない 1 ブロックを復号する。
    pub(super) fn decrypt_ecb_block(&self, ciphertext: &Block) -> Block {
        BlockState::decrypt(*ciphertext, &self.round_keys)
    }
}

#[cfg(test)]
mod tests;
