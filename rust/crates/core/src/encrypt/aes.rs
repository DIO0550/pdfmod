//! FIPS 197 の AES-128 / AES-256 を使った PDF 復号のための内部実装。

mod block;
mod byte;
mod round_keys;

use std::mem::size_of_val;

use self::block::BlockState;
use self::round_keys::RoundKeys;

const BLOCK_LEN: usize = 16;
const KEY_128_LEN: usize = 16;
const KEY_256_LEN: usize = 32;
type Block = [u8; BLOCK_LEN];

/// PDF の IV 付き AES-CBC を復号できない理由。
#[derive(Debug, PartialEq, Eq)]
pub(super) enum AesCbcError {
    /// 16 バイトの IV または 1 ブロック以上の完全な暗号文が欠けている。
    InvalidLength,
    /// 復号後の末尾に正しい PKCS#7 パディングがない。
    InvalidPadding,
}

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

    /// IV を含まない完全なブロック列を、指定された IV で CBC 復号する（SP 800-38A §6.2）。
    /// 入力ブロック数に対応する平文をそのまま返し、パディングは取り除かない。
    pub(super) fn decrypt_cbc_blocks(&self, iv: &Block, ciphertext: &[Block]) -> Vec<u8> {
        let mut plaintext = Vec::with_capacity(size_of_val(ciphertext));
        let mut previous = iv;
        for block in ciphertext {
            let mut output = self.decrypt_ecb_block(block);
            for (byte, &previous_byte) in output.iter_mut().zip(previous) {
                *byte ^= previous_byte;
            }

            plaintext.extend_from_slice(&output);
            previous = block;
        }

        plaintext
    }

    /// PDF の AESV2/AESV3 の文字列・ストリームを復号する（ISO 32000 §7.6）。
    /// IV の不足・暗号文が空または端数ありなら `InvalidLength`、不正な末尾なら `InvalidPadding`。
    pub(super) fn decrypt_pdf_cbc(&self, input: &[u8]) -> Result<Vec<u8>, AesCbcError> {
        let Some((iv, ciphertext)) = input.split_first_chunk::<BLOCK_LEN>() else {
            return Err(AesCbcError::InvalidLength);
        };
        let (blocks, remainder) = ciphertext.as_chunks::<BLOCK_LEN>();
        if blocks.is_empty() || !remainder.is_empty() {
            return Err(AesCbcError::InvalidLength);
        }

        Self::remove_pdf_padding(self.decrypt_cbc_blocks(iv, blocks))
    }

    fn remove_pdf_padding(mut plaintext: Vec<u8>) -> Result<Vec<u8>, AesCbcError> {
        let Some((_, last_block)) = plaintext.split_last_chunk::<BLOCK_LEN>() else {
            return Err(AesCbcError::InvalidPadding);
        };
        let [.., padding_byte] = *last_block;
        let padding_len = usize::from(padding_byte);
        // 1 バイト目の不一致で打ち切らず、末尾のブロック全体で一致を調べる。
        let padding_matches =
            last_block
                .iter()
                .rev()
                .enumerate()
                .fold(true, |matches, (offset, &byte)| {
                    let outside_padding = offset >= padding_len;
                    matches & (outside_padding | (byte == padding_byte))
                });
        if !(1..=BLOCK_LEN).contains(&padding_len) || !padding_matches {
            return Err(AesCbcError::InvalidPadding);
        }

        plaintext.truncate(plaintext.len() - padding_len);
        Ok(plaintext)
    }
}

#[cfg(test)]
mod tests;
