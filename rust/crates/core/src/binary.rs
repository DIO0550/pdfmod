use crate::byte_offset::ByteOffset;

/// バイト列を安全に読み進めるカーソルリーダ（crate 内部用）。
#[derive(Debug, Clone)]
pub(crate) struct ByteReader<'a> {
    input: &'a [u8],
    pos: usize,
}

impl<'a> ByteReader<'a> {
    /// 入力スライス全体を先頭から読むリーダを生成する。
    #[inline]
    #[must_use]
    pub const fn new(input: &'a [u8]) -> Self {
        Self { input, pos: 0 }
    }

    /// 現在の読み取り位置（先頭からのバイトオフセット）を返す。
    #[inline]
    #[allow(dead_code)]
    pub fn position(&self) -> ByteOffset {
        ByteOffset::new(u64::try_from(self.pos).unwrap_or(u64::MAX))
    }

    /// 残りバイト数を返す。
    #[inline]
    #[must_use]
    #[allow(dead_code)]
    pub const fn remaining(&self) -> usize {
        self.input.len().saturating_sub(self.pos)
    }

    /// すべて読み切ったかを返す。
    #[inline]
    #[must_use]
    #[allow(dead_code)]
    pub const fn is_empty(&self) -> bool {
        self.pos >= self.input.len()
    }

    /// 指定された長さのスライスを読み進めて返す。
    /// 残りバイト数が不足している場合は `None` を返す（カーソルは進まない）。
    pub fn read_bytes(&mut self, len: usize) -> Option<&'a [u8]> {
        let end = self.pos.checked_add(len)?;
        let slice = self.input.get(self.pos..end)?;
        self.pos = end;
        Some(slice)
    }

    /// 指定バイト数（0〜8 バイト）を読み進め、ビッグエンディアン符号なし整数（u64）として返す。
    /// 幅が 0 の場合はカーソルを進めず `Some(0)` を返す。
    /// 残りバイト数が不足している場合は `None` を返す（カーソルは進まない）。
    pub fn read_be_uint(&mut self, width: usize) -> Option<u64> {
        if width == 0 {
            return Some(0);
        }
        let bytes = self.read_bytes(width)?;
        Some(bytes.iter().fold(0u64, |acc, &b| (acc << 8) | u64::from(b)))
    }
}

#[cfg(test)]
mod tests;
