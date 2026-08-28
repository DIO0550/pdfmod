//! カノニカル Huffman 符号の復号表。RFC 1951 §3.2.2 に対応する。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::symbols::{fixed_distance_lengths, fixed_literal_lengths};

/// DEFLATE が許す最大の符号長。
pub const MAX_CODE_LENGTH: usize = 15;

/// カノニカル Huffman 復号表。
///
/// 符号そのものは保持せず、「符号長ごとのシンボル数」と「符号長順に並べたシンボル列」
/// だけを持つ。復号は 1 ビットずつ読みながら符号長を 1 から増やし、その長さの符号の
/// 範囲に入った時点で確定する。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HuffmanTable {
    /// 符号長ごとのシンボル数。添字が符号長で、`counts[0]` は常に 0。
    counts: [u16; MAX_CODE_LENGTH + 1],
    /// 符号長の昇順、同じ長さならシンボル番号の昇順に並べたシンボル列。
    symbols: Vec<u16>,
}

impl HuffmanTable {
    /// 符号長の配列（添字がシンボル番号、値がビット長。0 は「符号を持たない」）から表を作る。
    ///
    /// # Errors
    ///
    /// - [`FlateErrorKind::InvalidCodeLength`] — 符号長が 15 を超える
    /// - [`FlateErrorKind::OversubscribedHuffman`] — 符号長の集合が過剰で符号木を作れない
    ///
    /// 逆に不足（under-subscribed）な集合は受理する。使われていない符号を読んだ場合は
    /// 復号時に [`FlateErrorKind::InvalidHuffmanCode`] になる。
    ///
    /// [`FlateErrorKind::InvalidCodeLength`]: crate::filter::error::FlateErrorKind::InvalidCodeLength
    /// [`FlateErrorKind::OversubscribedHuffman`]: crate::filter::error::FlateErrorKind::OversubscribedHuffman
    /// [`FlateErrorKind::InvalidHuffmanCode`]: crate::filter::error::FlateErrorKind::InvalidHuffmanCode
    pub fn from_lengths(lengths: &[u8], position: ByteOffset) -> Result<Self, FlateError> {
        let mut counts = [0_u16; MAX_CODE_LENGTH + 1];
        for &length in lengths {
            if length == 0 {
                continue;
            }
            let slot = counts
                .get_mut(usize::from(length))
                .ok_or_else(|| FlateError::invalid_code_length_at(position, length))?;
            *slot = slot.saturating_add(1);
        }

        // Kraft の不等式で符号木が構成可能か確かめる（過剰なら符号が重複する）
        let mut remaining = 1_i32;
        for length in 1..=MAX_CODE_LENGTH {
            remaining <<= 1;
            remaining -= i32::from(counts.get(length).copied().unwrap_or(0));
            if remaining < 0 {
                return Err(FlateError::oversubscribed_huffman_at(position));
            }
        }

        // 符号長ごとの開始位置を求めてからシンボルを並べる
        let mut offsets = [0_usize; MAX_CODE_LENGTH + 2];
        for length in 1..=MAX_CODE_LENGTH {
            let count = usize::from(counts.get(length).copied().unwrap_or(0));
            let start = offsets.get(length).copied().unwrap_or(0);
            if let Some(next) = offsets.get_mut(length + 1) {
                *next = start.saturating_add(count);
            }
        }
        let total = offsets.get(MAX_CODE_LENGTH + 1).copied().unwrap_or(0);
        let mut symbols = vec![0_u16; total];
        for (symbol, &length) in lengths.iter().enumerate() {
            if length == 0 {
                continue;
            }
            let index = usize::from(length);
            let slot = offsets.get(index).copied().unwrap_or(0);
            if let Some(entry) = symbols.get_mut(slot) {
                *entry = u16::try_from(symbol).unwrap_or(u16::MAX);
            }
            if let Some(next) = offsets.get_mut(index) {
                *next = slot.saturating_add(1);
            }
        }

        Ok(Self { counts, symbols })
    }

    /// ビットストリームから 1 シンボルを復号する。
    ///
    /// 符号長 1 から順に、その長さの符号の範囲へ入るまでビットを読み足す。
    /// Huffman 符号は上位ビットから並ぶため、読んだビットを左シフトで積み上げる。
    ///
    /// # Errors
    ///
    /// 15 ビット読んでもどの符号にも一致しない場合は
    /// [`FlateErrorKind::InvalidHuffmanCode`]。入力が尽きた場合は `UnexpectedEof`。
    ///
    /// [`FlateErrorKind::InvalidHuffmanCode`]: crate::filter::error::FlateErrorKind::InvalidHuffmanCode
    pub fn decode(&self, reader: &mut BitReader<'_>) -> Result<u16, FlateError> {
        // code: これまでに読んだビットが表す符号値
        // first: その符号長における最小の符号値
        // index: その符号長のシンボルが symbols 内で始まる位置
        let mut code = 0_u32;
        let mut first = 0_u32;
        let mut index = 0_usize;
        for length in 1..=MAX_CODE_LENGTH {
            code |= reader.read_bit()?;
            let count = u32::from(self.counts.get(length).copied().unwrap_or(0));
            // 表の構築上 code は常に first 以上になるが、桁借りしても panic せず
            // 「範囲外」と判定されるように wrapping_sub を使う
            let offset_in_length = code.wrapping_sub(first);
            if offset_in_length < count {
                let offset =
                    index.saturating_add(usize::try_from(offset_in_length).unwrap_or(usize::MAX));
                return self
                    .symbols
                    .get(offset)
                    .copied()
                    .ok_or_else(|| FlateError::invalid_huffman_code_at(reader.position()));
            }
            index = index.saturating_add(usize::try_from(count).unwrap_or(0));
            first = (first + count) << 1;
            code <<= 1;
        }
        Err(FlateError::invalid_huffman_code_at(reader.position()))
    }
}

/// 1 ブロックの展開に使うリテラル／長さ符号表と距離符号表の組。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct HuffmanTables {
    /// リテラル／長さ符号（シンボル 0..=287）。
    pub literal: HuffmanTable,
    /// 距離符号（シンボル 0..=31）。
    pub distance: HuffmanTable,
}

impl HuffmanTables {
    /// 固定 Huffman の符号表（RFC 1951 §3.2.6）を構築する。
    ///
    /// # Errors
    ///
    /// 固定符号長表は常に妥当なので実際には失敗しないが、[`HuffmanTable::from_lengths`]
    /// と同じ経路を通すために `Result` を返す。
    pub fn fixed() -> Result<Self, FlateError> {
        let position = ByteOffset::new(0);
        Ok(Self {
            literal: HuffmanTable::from_lengths(&fixed_literal_lengths(), position)?,
            distance: HuffmanTable::from_lengths(&fixed_distance_lengths(), position)?,
        })
    }
}

#[cfg(test)]
mod tests;
