//! DEFLATE のビットストリームを LSB-first で読むリーダ。
//!
//! RFC 1951 §3.1.1 に従い、各バイトの最下位ビットから読み進める。
//! panic 不在契約（`slice::get` の Option / `checked_add` で範囲外を吸収）。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;

/// ビット単位で入力を読み進めるカーソル。
#[derive(Debug)]
pub struct BitReader<'a> {
    /// 読み取り対象の入力全体。
    input: &'a [u8],
    /// 次に読むバイトの位置。
    byte_pos: usize,
    /// 現在バイト内で次に読むビット（0..=7、0 が最下位ビット）。
    bit_pos: u32,
}

impl<'a> BitReader<'a> {
    /// 入力全体を先頭から読むリーダを作る。
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            input,
            byte_pos: 0,
            bit_pos: 0,
        }
    }

    /// 現在位置を入力先頭からのバイトオフセットとして返す。
    ///
    /// ビット位置の端数は切り捨て、そのビットを含むバイトの位置を返す。
    pub fn position(&self) -> ByteOffset {
        ByteOffset::new(u64::try_from(self.byte_pos).unwrap_or(u64::MAX))
    }

    /// 次の 1 ビットを読む。
    ///
    /// # Errors
    ///
    /// 入力が尽きている場合は [`FlateErrorKind::UnexpectedEof`]。
    ///
    /// [`FlateErrorKind::UnexpectedEof`]: crate::filter::error::FlateErrorKind::UnexpectedEof
    pub fn read_bit(&mut self) -> Result<u32, FlateError> {
        let byte = self
            .input
            .get(self.byte_pos)
            .copied()
            .ok_or_else(|| FlateError::unexpected_eof_at(self.position()))?;
        let bit = u32::from((byte >> self.bit_pos) & 1);
        if self.bit_pos == 7 {
            self.bit_pos = 0;
            self.byte_pos = self
                .byte_pos
                .checked_add(1)
                .ok_or_else(|| FlateError::unexpected_eof_at(self.position()))?;
        } else {
            self.bit_pos += 1;
        }
        Ok(bit)
    }

    /// 次の `count` ビットを LSB-first で読み、`u32` に詰めて返す。
    ///
    /// 最初に読んだビットが結果の最下位ビットになる。`count` が 0 なら 0 を返す。
    ///
    /// # 契約
    ///
    /// `count` は 32 以下であること。DEFLATE で読む固定長フィールドは最大 16 ビット
    /// （非圧縮ブロックの LEN / NLEN）なので、呼び出し側は常にこれを満たす。
    ///
    /// # Errors
    ///
    /// 途中で入力が尽きた場合は [`FlateErrorKind::UnexpectedEof`]。
    ///
    /// [`FlateErrorKind::UnexpectedEof`]: crate::filter::error::FlateErrorKind::UnexpectedEof
    pub fn read_bits(&mut self, count: u32) -> Result<u32, FlateError> {
        debug_assert!(count <= 32, "read_bits supports at most 32 bits");
        let mut value = 0_u32;
        for index in 0..count.min(32) {
            value |= self.read_bit()? << index;
        }
        Ok(value)
    }

    /// 読み取り位置を次のバイト境界へ切り上げる。既に境界上なら何もしない。
    pub fn align_to_byte(&mut self) {
        if self.bit_pos != 0 {
            self.bit_pos = 0;
            self.byte_pos = self.byte_pos.saturating_add(1);
        }
    }

    /// バイト境界から `len` バイトをそのまま取り出し、位置を進める。
    ///
    /// # 契約
    ///
    /// 呼び出し前にバイト境界上にあること（`align_to_byte` を通すか、先頭から
    /// 1 ビットも読んでいないこと）。境界上でない場合はデバッグビルドで検出する。
    ///
    /// # 戻り値
    ///
    /// `Ok(slice)` — `input[byte_pos..byte_pos + len]` を返し、位置を `len` だけ進める。
    ///
    /// # Errors
    ///
    /// 範囲を超える場合（`checked_add` のオーバーフローを含む）は
    /// [`FlateErrorKind::UnexpectedEof`]。位置は進めない。
    ///
    /// [`FlateErrorKind::UnexpectedEof`]: crate::filter::error::FlateErrorKind::UnexpectedEof
    pub fn take_bytes(&mut self, len: usize) -> Result<&'a [u8], FlateError> {
        debug_assert_eq!(self.bit_pos, 0, "take_bytes requires byte alignment");
        let end = self
            .byte_pos
            .checked_add(len)
            .ok_or_else(|| FlateError::unexpected_eof_at(self.position()))?;
        let slice = self
            .input
            .get(self.byte_pos..end)
            .ok_or_else(|| FlateError::unexpected_eof_at(self.position()))?;
        self.byte_pos = end;
        Ok(slice)
    }
}

#[cfg(test)]
mod tests;
