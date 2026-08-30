//! DEFLATE ブロック列の展開。RFC 1951 §3.2.3 に対応する。

use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::huffman::HuffmanTables;
use crate::filter::flate::symbols::END_OF_BLOCK;
use crate::filter::flate::window::{Distance, Length, Window};

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
                let tables = HuffmanTables::read_dynamic(reader)?;
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
