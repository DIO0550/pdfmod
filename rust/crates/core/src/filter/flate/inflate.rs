//! DEFLATE ブロック列の展開。RFC 1951 §3.2.3 に対応する。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::huffman::{HuffmanTable, HuffmanTables};
use crate::filter::flate::symbols::{CODE_LENGTH_ORDER, END_OF_BLOCK};
use crate::filter::flate::window::{Distance, Length, Window};

/// HLIT（リテラル／長さ符号の個数）のビット幅と、読み取った値に足す下駄。
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
/// 符号長符号 16 の追加ビット幅と下駄。
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

/// ブロックを順に展開し、`BFINAL` が立ったブロックまで処理して展開結果を返す。
///
/// # Errors
///
/// 入力が尽きた場合は `UnexpectedEof`、BTYPE が予約値（11）なら `ReservedBlockType`、
/// 各ブロック種別の展開で検出した破損はそれぞれのエラー種別を返す。
pub fn inflate(reader: &mut BitReader<'_>) -> Result<Vec<u8>, FlateError> {
    let mut window = Window::new();
    // 固定符号表は RFC 1951 §3.2.6 の定数から作られる不変の表なので、
    // BTYPE=01 のブロックが現れるたびに作り直さず、ループの外で一度だけ構築する。
    let fixed_tables = HuffmanTables::fixed()?;
    loop {
        let is_final = reader.read_bit()? == 1;
        let position = reader.position();
        // read_bits(2) は 0..=3 しか返さないので変換は失敗しない。
        // panic 不在契約のため unwrap を使わず、到達しないフォールバック値として
        // 予約値の 3 を置く（万一到達しても ReservedBlockType でエラーになる）。
        let block_type = u8::try_from(reader.read_bits(2)?).unwrap_or(3);
        match block_type {
            0 => inflate_stored(reader, &mut window)?,
            1 => inflate_huffman(reader, &mut window, &fixed_tables)?,
            2 => {
                let tables = read_dynamic_tables(reader)?;
                inflate_huffman(reader, &mut window, &tables)?;
            }
            _ => return Err(FlateError::reserved_block_type_at(position, block_type)),
        }
        if is_final {
            return Ok(window.into_bytes());
        }
    }
}

/// 非圧縮ブロック（BTYPE=00）を展開する。
///
/// バイト境界まで切り上げてから LEN / NLEN（各 2 バイト、リトルエンディアン）を読み、
/// 補数関係を検証したうえで LEN バイトをそのまま出力へ複製する。
fn inflate_stored(reader: &mut BitReader<'_>, window: &mut Window) -> Result<(), FlateError> {
    reader.align_to_byte();
    let position = reader.position();
    let len = reader.read_u16_le()?;
    let nlen = reader.read_u16_le()?;
    if nlen != !len {
        return Err(FlateError::stored_length_mismatch_at(position, len, nlen));
    }
    let data = reader.take_bytes(usize::from(len))?;
    window.extend_from_slice(data);
    Ok(())
}

/// Huffman 符号で圧縮されたブロックを、ブロック終端シンボルまで展開する。
fn inflate_huffman(
    reader: &mut BitReader<'_>,
    window: &mut Window,
    tables: &HuffmanTables,
) -> Result<(), FlateError> {
    loop {
        let symbol = tables.literal.decode(reader)?;
        match symbol {
            0..=255 => window.push_literal(u8::try_from(symbol).unwrap_or_default()),
            END_OF_BLOCK => return Ok(()),
            _ => {
                let length = Length::read(reader, symbol)?;
                let distance_symbol = tables.distance.decode(reader)?;
                let distance = Distance::read(reader, distance_symbol)?;
                window.copy_match(distance, length, reader.position())?;
            }
        }
    }
}

/// 動的 Huffman ブロックのヘッダから、リテラル／長さ符号表と距離符号表を復元する。
///
/// HLIT / HDIST / HCLEN を読み、19 個の符号長符号を規定順に読んで符号長符号表を作り、
/// その表で「リテラル／長さ符号と距離符号の符号長」を 1 本の列として復号する。
fn read_dynamic_tables(reader: &mut BitReader<'_>) -> Result<HuffmanTables, FlateError> {
    let position = reader.position();
    let literal_count = usize::try_from(reader.read_bits(HLIT_BITS)?).unwrap_or(0) + HLIT_OFFSET;
    let distance_count = usize::try_from(reader.read_bits(HDIST_BITS)?).unwrap_or(0) + HDIST_OFFSET;
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

    // リテラル／長さ符号と距離符号の符号長を連結した 1 本の列として復元する
    let total = literal_count.saturating_add(distance_count);
    let mut lengths = vec![0_u8; total];
    let mut filled = 0_usize;
    while filled < total {
        let symbol = code_length_table.decode(reader)?;
        match symbol {
            0..=15 => {
                if let Some(entry) = lengths.get_mut(filled) {
                    *entry = u8::try_from(symbol).unwrap_or(0);
                }
                filled = filled.saturating_add(1);
            }
            REPEAT_PREVIOUS => {
                // 直前の符号長を 3..=6 回繰り返す
                let previous = filled
                    .checked_sub(1)
                    .and_then(|index| lengths.get(index).copied())
                    .ok_or_else(|| FlateError::invalid_code_length_repeat_at(reader.position()))?;
                let repeat = usize::try_from(reader.read_bits(REPEAT_PREVIOUS_BITS)?).unwrap_or(0)
                    + REPEAT_PREVIOUS_OFFSET;
                filled = fill_lengths(&mut lengths, filled, repeat, previous, reader.position())?;
            }
            REPEAT_ZERO_SHORT => {
                // 符号長 0 を 3..=10 回繰り返す
                let repeat = usize::try_from(reader.read_bits(REPEAT_ZERO_SHORT_BITS)?)
                    .unwrap_or(0)
                    + REPEAT_ZERO_SHORT_OFFSET;
                filled = fill_lengths(&mut lengths, filled, repeat, 0, reader.position())?;
            }
            REPEAT_ZERO_LONG => {
                // 符号長 0 を 11..=138 回繰り返す
                let repeat = usize::try_from(reader.read_bits(REPEAT_ZERO_LONG_BITS)?).unwrap_or(0)
                    + REPEAT_ZERO_LONG_OFFSET;
                filled = fill_lengths(&mut lengths, filled, repeat, 0, reader.position())?;
            }
            _ => {
                return Err(FlateError::invalid_code_length_symbol_at(
                    reader.position(),
                    symbol,
                ))
            }
        }
    }

    // literal_count は最大 288、distance_count は最大 32 で、どちらも total 以下
    let (literal_lengths, distance_lengths) = lengths.split_at(literal_count);
    Ok(HuffmanTables {
        literal: HuffmanTable::from_lengths(literal_lengths, position)?,
        distance: HuffmanTable::from_lengths(distance_lengths, position)?,
    })
}

/// `lengths` の `filled` 以降を `value` で `repeat` 個埋め、新しい `filled` を返す。
///
/// 列の長さを超える繰り返しは壊れたデータなのでエラーにする。
fn fill_lengths(
    lengths: &mut [u8],
    filled: usize,
    repeat: usize,
    value: u8,
    position: ByteOffset,
) -> Result<usize, FlateError> {
    let end = filled
        .checked_add(repeat)
        .ok_or_else(|| FlateError::invalid_code_length_repeat_at(position))?;
    let slice = lengths
        .get_mut(filled..end)
        .ok_or_else(|| FlateError::invalid_code_length_repeat_at(position))?;
    slice.fill(value);
    Ok(end)
}
