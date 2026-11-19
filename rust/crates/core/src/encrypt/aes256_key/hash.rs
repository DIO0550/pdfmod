//! R5 の SHA-256 と R6 の Algorithm 2.B。

use super::{Aes256FileKeyError, KEY_LEN};
use crate::encrypt::aes::Aes;
use crate::encrypt::sha2::sha256::Sha256;
use crate::encrypt::sha2::sha512::{Sha384, Sha512};

const COPIES: usize = 64;
const MIN_ROUNDS: u16 = 64;

#[derive(Clone, Copy)]
pub(super) enum Revision {
    R5,
    R6,
}

impl Revision {
    pub(super) fn hash(
        self,
        password: &[u8],
        salt: &[u8],
        user_data: &[u8],
    ) -> Result<[u8; KEY_LEN], Aes256FileKeyError> {
        let mut sha = Sha256::new();
        for part in [password, salt, user_data] {
            sha.update(part)
                .ok_or(Aes256FileKeyError::InvalidHashInput)?;
        }
        let initial = sha.finalize();
        match self {
            Self::R5 => Ok(initial),
            Self::R6 => hardened_hash(initial, password, user_data)
                .ok_or(Aes256FileKeyError::InvalidHashInput),
        }
    }
}

/// 次の AES 入力には、選択した SHA-2 の出力を全バイト使う。
enum RoundHash {
    Sha256([u8; 32]),
    Sha384([u8; 48]),
    Sha512([u8; 64]),
}

impl RoundHash {
    fn bytes(&self) -> &[u8] {
        match self {
            Self::Sha256(bytes) => bytes,
            Self::Sha384(bytes) => bytes,
            Self::Sha512(bytes) => bytes,
        }
    }

    fn encrypt_round(&self, password: &[u8], user_data: &[u8], work: &mut Vec<u8>) -> Option<()> {
        let (key, rest) = self.bytes().split_first_chunk::<16>()?;
        let iv = rest.first_chunk::<16>()?;
        work.clear();
        work.extend_from_slice(password);
        work.extend_from_slice(self.bytes());
        work.extend_from_slice(user_data);
        let unit_len = work.len();
        for _ in 1..COPIES {
            work.extend_from_within(..unit_len);
        }

        // 64 回並べた長さは必ず AES のブロック長 (16) で割り切れる。
        let (blocks, _) = work.as_chunks_mut::<16>();
        Aes::new_128(key).encrypt_cbc_blocks(iv, blocks);
        Some(())
    }

    fn from_ciphertext(encrypted: &[u8]) -> Option<Self> {
        let first = encrypted.first_chunk::<16>()?;
        match u128::from_be_bytes(*first) % 3 {
            0 => Sha256::digest(encrypted).map(Self::Sha256),
            1 => Sha384::digest(encrypted).map(Self::Sha384),
            _ => Sha512::digest(encrypted).map(Self::Sha512),
        }
    }
}

fn hardened_hash(
    initial: [u8; KEY_LEN],
    password: &[u8],
    user_data: &[u8],
) -> Option<[u8; KEY_LEN]> {
    let mut hash = RoundHash::Sha256(initial);
    // 最大の SHA-512 出力を見込んだ作業領域を全ラウンドで再利用する。
    let mut encrypted = Vec::with_capacity((password.len() + 64 + user_data.len()) * COPIES);
    let mut round = 0_u16;
    loop {
        round += 1;
        hash.encrypt_round(password, user_data, &mut encrypted)?;
        hash = RoundHash::from_ciphertext(&encrypted)?;
        let last = u16::from(*encrypted.last()?);
        if round >= MIN_ROUNDS && round >= last + 32 {
            return hash.bytes().first_chunk().copied();
        }
    }
}
