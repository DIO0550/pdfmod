//! カノニカル Huffman 符号の復号表。RFC 1951 §3.2.2 に対応する。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::symbols::{CODE_LENGTH_ORDER, DISTANCE_SYMBOLS, LITERAL_SYMBOLS};

/// DEFLATE が許す最大の符号長。
pub const MAX_CODE_LENGTH: usize = 15;

/// HLIT（リテラル／長さ符号の個数）のビット幅。
const HLIT_BITS: u32 = 5;
/// HLIT の下駄（RFC 1951 §3.2.7）。
const HLIT_OFFSET: usize = 257;
/// HDIST（距離符号の個数）のビット幅。
const HDIST_BITS: u32 = 5;
/// HDIST の下駄。
const HDIST_OFFSET: usize = 1;
/// HCLEN（符号長符号の個数）のビット幅。
const HCLEN_BITS: u32 = 4;
/// HCLEN の下駄。
const HCLEN_OFFSET: usize = 4;
/// 符号長符号 1 つあたりの符号長のビット幅。
const CODE_LENGTH_BITS: u32 = 3;
/// 直前の符号長を繰り返す符号長符号。
const REPEAT_PREVIOUS: u16 = 16;
/// 符号長符号 16 の追加ビット幅。
const REPEAT_PREVIOUS_BITS: u32 = 2;
/// 符号長符号 16 の繰り返し回数の下駄。
const REPEAT_PREVIOUS_OFFSET: usize = 3;
/// 符号長 0 を短く繰り返す符号長符号。
const REPEAT_ZERO_SHORT: u16 = 17;
/// 符号長符号 17 の追加ビット幅。
const REPEAT_ZERO_SHORT_BITS: u32 = 3;
/// 符号長符号 17 の繰り返し回数の下駄。
const REPEAT_ZERO_SHORT_OFFSET: usize = 3;
/// 符号長 0 を長く繰り返す符号長符号。
const REPEAT_ZERO_LONG: u16 = 18;
/// 符号長符号 18 の追加ビット幅。
const REPEAT_ZERO_LONG_BITS: u32 = 7;
/// 符号長符号 18 の繰り返し回数の下駄。
const REPEAT_ZERO_LONG_OFFSET: usize = 11;

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

    /// 固定 Huffman のリテラル／長さ符号長表（RFC 1951 §3.2.6）。
    ///
    /// 0..=143 が 8 ビット、144..=255 が 9 ビット、256..=279 が 7 ビット、280..=287 が 8 ビット。
    fn fixed_literal_lengths() -> [u8; LITERAL_SYMBOLS] {
        let mut lengths = [8_u8; LITERAL_SYMBOLS];
        for (symbol, length) in lengths.iter_mut().enumerate() {
            *length = match symbol {
                0..=143 => 8,
                144..=255 => 9,
                256..=279 => 7,
                _ => 8,
            };
        }
        lengths
    }

    /// 固定 Huffman の距離符号長表。全 32 シンボルが 5 ビット固定。
    fn fixed_distance_lengths() -> [u8; DISTANCE_SYMBOLS] {
        [5_u8; DISTANCE_SYMBOLS]
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
            literal: HuffmanTable::from_lengths(&HuffmanTable::fixed_literal_lengths(), position)?,
            distance: HuffmanTable::from_lengths(
                &HuffmanTable::fixed_distance_lengths(),
                position,
            )?,
        })
    }

    /// 動的 Huffman ブロック（BTYPE=10）のヘッダから符号表を復元する。
    ///
    /// HLIT / HDIST / HCLEN を読み、19 個の符号長符号を規定順に読んで符号長符号表を作り、
    /// その表でリテラル／長さ符号と距離符号の符号長を [`CodeLengths`] として復号する。
    ///
    /// # Errors
    ///
    /// - [`FlateErrorKind::InvalidCodeLengthSymbol`] — 符号長符号が 0..=18 の範囲外
    /// - [`FlateErrorKind::InvalidCodeLengthRepeat`] — 繰り返しが符号長列の残りを超える
    /// - [`FlateErrorKind::OversubscribedHuffman`] — 復元した符号長の集合が過剰
    /// - 入力が尽きた場合は `UnexpectedEof`
    ///
    /// [`FlateErrorKind::InvalidCodeLengthSymbol`]: crate::filter::error::FlateErrorKind::InvalidCodeLengthSymbol
    /// [`FlateErrorKind::InvalidCodeLengthRepeat`]: crate::filter::error::FlateErrorKind::InvalidCodeLengthRepeat
    /// [`FlateErrorKind::OversubscribedHuffman`]: crate::filter::error::FlateErrorKind::OversubscribedHuffman
    pub fn read_dynamic(reader: &mut BitReader<'_>) -> Result<Self, FlateError> {
        let position = reader.position();
        let literal_count =
            usize::try_from(reader.read_bits(HLIT_BITS)?).unwrap_or(0) + HLIT_OFFSET;
        let distance_count =
            usize::try_from(reader.read_bits(HDIST_BITS)?).unwrap_or(0) + HDIST_OFFSET;
        let code_length_count =
            usize::try_from(reader.read_bits(HCLEN_BITS)?).unwrap_or(0) + HCLEN_OFFSET;

        // 符号長符号の符号長は 3 ビット固定で、規定の順序で並ぶ
        let mut code_length_lengths = [0_u8; CODE_LENGTH_ORDER.len()];
        for &slot in CODE_LENGTH_ORDER.iter().take(code_length_count) {
            let length = u8::try_from(reader.read_bits(CODE_LENGTH_BITS)?).unwrap_or(0);
            if let Some(entry) = code_length_lengths.get_mut(slot) {
                *entry = length;
            }
        }
        let code_length_table = HuffmanTable::from_lengths(&code_length_lengths, position)?;

        let lengths = CodeLengths::read(
            reader,
            &code_length_table,
            literal_count.saturating_add(distance_count),
        )?;
        let (literal_lengths, distance_lengths) = lengths.split(literal_count);
        Ok(Self {
            literal: HuffmanTable::from_lengths(literal_lengths, position)?,
            distance: HuffmanTable::from_lengths(distance_lengths, position)?,
        })
    }
}

/// 動的ブロックで復元する符号長の列。
///
/// リテラル／長さ符号と距離符号の符号長を、2 本に分けず 1 本の列として持つ。
/// 繰り返しコード 16 は直前の符号長を複製するため境界を跨いで前の列の末尾を参照しうる
/// ので、1 本で復元してから [`Self::split`] で分けたほうが境界の特別扱いが要らない。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CodeLengths {
    /// 復元済みの符号長。
    lengths: Vec<u8>,
    /// 復元しきったときの要素数（HLIT + HDIST）。
    total: usize,
}

impl CodeLengths {
    /// 符号長符号表を使って `total` 個の符号長を復元する。
    ///
    /// # Errors
    ///
    /// 符号長符号が 0..=18 の範囲外なら [`FlateErrorKind::InvalidCodeLengthSymbol`]、
    /// 繰り返しが列の残りを超えるなら [`FlateErrorKind::InvalidCodeLengthRepeat`]。
    ///
    /// [`FlateErrorKind::InvalidCodeLengthSymbol`]: crate::filter::error::FlateErrorKind::InvalidCodeLengthSymbol
    /// [`FlateErrorKind::InvalidCodeLengthRepeat`]: crate::filter::error::FlateErrorKind::InvalidCodeLengthRepeat
    fn read(
        reader: &mut BitReader<'_>,
        table: &HuffmanTable,
        total: usize,
    ) -> Result<Self, FlateError> {
        let mut lengths = Self {
            lengths: Vec::new(),
            total,
        };
        while !lengths.is_complete() {
            let symbol = table.decode(reader)?;
            match symbol {
                0..=15 => lengths.push(u8::try_from(symbol).unwrap_or(0)),
                // 直前の符号長を 3..=6 回繰り返す
                REPEAT_PREVIOUS => {
                    let repeat = usize::try_from(reader.read_bits(REPEAT_PREVIOUS_BITS)?)
                        .unwrap_or(0)
                        + REPEAT_PREVIOUS_OFFSET;
                    lengths.repeat_previous(repeat, reader.position())?;
                }
                // 符号長 0 を 3..=10 回繰り返す
                REPEAT_ZERO_SHORT => {
                    let repeat = usize::try_from(reader.read_bits(REPEAT_ZERO_SHORT_BITS)?)
                        .unwrap_or(0)
                        + REPEAT_ZERO_SHORT_OFFSET;
                    lengths.fill(repeat, 0, reader.position())?;
                }
                // 符号長 0 を 11..=138 回繰り返す
                REPEAT_ZERO_LONG => {
                    let repeat = usize::try_from(reader.read_bits(REPEAT_ZERO_LONG_BITS)?)
                        .unwrap_or(0)
                        + REPEAT_ZERO_LONG_OFFSET;
                    lengths.fill(repeat, 0, reader.position())?;
                }
                _ => {
                    return Err(FlateError::invalid_code_length_symbol_at(
                        reader.position(),
                        symbol,
                    ))
                }
            }
        }
        Ok(lengths)
    }

    /// 宣言された個数ぶんを復元し終えたか。
    fn is_complete(&self) -> bool {
        self.lengths.len() >= self.total
    }

    /// 符号長を 1 つ書き足す。ループの継続条件が `is_complete` なので溢れない。
    fn push(&mut self, length: u8) {
        self.lengths.push(length);
    }

    /// 直前の符号長を `repeat` 個複製する（符号長符号 16）。
    ///
    /// # Errors
    ///
    /// 列がまだ空（複製する対象が無い）なら [`FlateErrorKind::InvalidCodeLengthRepeat`]。
    ///
    /// [`FlateErrorKind::InvalidCodeLengthRepeat`]: crate::filter::error::FlateErrorKind::InvalidCodeLengthRepeat
    fn repeat_previous(&mut self, repeat: usize, position: ByteOffset) -> Result<(), FlateError> {
        let previous = self
            .lengths
            .last()
            .copied()
            .ok_or_else(|| FlateError::invalid_code_length_repeat_at(position))?;
        self.fill(repeat, previous, position)
    }

    /// `value` を `repeat` 個書き足す（符号長符号 16 / 17 / 18）。
    ///
    /// # Errors
    ///
    /// 宣言された個数を超える繰り返しは壊れたデータなので
    /// [`FlateErrorKind::InvalidCodeLengthRepeat`]。
    ///
    /// [`FlateErrorKind::InvalidCodeLengthRepeat`]: crate::filter::error::FlateErrorKind::InvalidCodeLengthRepeat
    fn fill(&mut self, repeat: usize, value: u8, position: ByteOffset) -> Result<(), FlateError> {
        let end = self
            .lengths
            .len()
            .checked_add(repeat)
            .ok_or_else(|| FlateError::invalid_code_length_repeat_at(position))?;
        if end > self.total {
            return Err(FlateError::invalid_code_length_repeat_at(position));
        }
        self.lengths.resize(end, value);
        Ok(())
    }

    /// リテラル／長さ符号ぶんと距離符号ぶんに分ける。
    ///
    /// `literal_count` は必ず全体長以下だが、`split_at` の panic に頼らず
    /// 範囲取得の `Option` 経由で分ける（panic 不在契約）。
    fn split(&self, literal_count: usize) -> (&[u8], &[u8]) {
        let literal = self.lengths.get(..literal_count).unwrap_or(&self.lengths);
        let distance = self.lengths.get(literal_count..).unwrap_or(&[]);
        (literal, distance)
    }
}

#[cfg(test)]
mod tests;
