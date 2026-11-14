//! SHA-2 のブロック分割とパディング（FIPS 180-4 §5.1–5.2）。

/// 64 または 128 バイトのブロックを扱い、先頭 `len < BLOCK_LEN` バイトに未処理の末尾を保持する。
pub(super) struct BlockBuffer<const BLOCK_LEN: usize> {
    bytes: [u8; BLOCK_LEN],
    len: usize,
}

impl<const BLOCK_LEN: usize> BlockBuffer<BLOCK_LEN> {
    /// SHA-2 が使う 64 バイトまたは 128 バイトの空バッファを作る。
    pub(super) fn new() -> Self {
        const { assert!(matches!(BLOCK_LEN, 64 | 128)) };

        Self {
            bytes: [0; BLOCK_LEN],
            len: 0,
        }
    }

    /// 完成したブロックを順に渡し、残りのバイトを次の呼び出しに持ち越す。
    pub(super) fn update(&mut self, mut input: &[u8], mut compress: impl FnMut(&[u8; BLOCK_LEN])) {
        if self.len != 0 {
            let space = &mut self.bytes[self.len..];
            let copy_len = input.len().min(space.len());
            let (prefix, rest) = input.split_at(copy_len);
            space[..copy_len].copy_from_slice(prefix);

            if copy_len < space.len() {
                self.len += copy_len;
                return;
            }

            compress(&self.bytes);
            input = rest;
        }

        let (blocks, tail) = input.as_chunks::<BLOCK_LEN>();
        for block in blocks {
            compress(block);
        }
        self.bytes[..tail.len()].copy_from_slice(tail);
        self.len = tail.len();
    }

    /// 元のビット長（8 または 16 バイトのビッグエンディアン表現）を末尾に付ける。
    pub(super) fn finalize<const LENGTH_LEN: usize>(
        mut self,
        bit_len: [u8; LENGTH_LEN],
        mut compress: impl FnMut(&[u8; BLOCK_LEN]),
    ) {
        const { assert!(LENGTH_LEN == BLOCK_LEN / 8) };

        self.bytes[self.len] = 0x80;
        self.bytes[self.len + 1..].fill(0);

        let length_offset = BLOCK_LEN - LENGTH_LEN;
        if self.len >= length_offset {
            compress(&self.bytes);
            self.bytes.fill(0);
        }

        self.bytes[length_offset..].copy_from_slice(&bit_len);
        compress(&self.bytes);
    }
}
