//! DEFLATE ブロック列の展開。RFC 1951 §3.2.3 に対応する。

use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;

/// 非圧縮ブロックの LEN / NLEN のバイト数。
const STORED_LENGTH_FIELD_LEN: usize = 2;

/// ブロックを順に展開し、`BFINAL` が立ったブロックまで処理して展開結果を返す。
///
/// # Errors
///
/// 入力が尽きた場合は `UnexpectedEof`、BTYPE が予約値（11）なら `ReservedBlockType`、
/// 各ブロック種別の展開で検出した破損はそれぞれのエラー種別を返す。
pub fn inflate(reader: &mut BitReader<'_>) -> Result<Vec<u8>, FlateError> {
    let mut output = Vec::new();
    loop {
        let is_final = reader.read_bit()? == 1;
        let position = reader.position();
        // read_bits(2) は 0..=3 しか返さないので変換は失敗しない。
        // panic 不在契約のため unwrap を使わず、到達しないフォールバック値として
        // 予約値の 3 を置く（万一到達しても ReservedBlockType でエラーになる）。
        let block_type = u8::try_from(reader.read_bits(2)?).unwrap_or(3);
        match block_type {
            0 => inflate_stored(reader, &mut output)?,
            // PR② で固定 Huffman、PR③ で動的 Huffman の展開に差し替える
            1 | 2 => return Err(FlateError::unsupported_block_type_at(position, block_type)),
            _ => return Err(FlateError::reserved_block_type_at(position, block_type)),
        }
        if is_final {
            return Ok(output);
        }
    }
}

/// 非圧縮ブロック（BTYPE=00）を展開する。
///
/// バイト境界まで切り上げてから LEN / NLEN（各 2 バイト、リトルエンディアン）を読み、
/// 補数関係を検証したうえで LEN バイトをそのまま出力へ複製する。
fn inflate_stored(reader: &mut BitReader<'_>, output: &mut Vec<u8>) -> Result<(), FlateError> {
    reader.align_to_byte();
    let position = reader.position();
    let len = read_u16_le(reader)?;
    let nlen = read_u16_le(reader)?;
    if nlen != !len {
        return Err(FlateError::stored_length_mismatch_at(position, len, nlen));
    }
    let data = reader.take_bytes(usize::from(len))?;
    output.extend_from_slice(data);
    Ok(())
}

/// バイト境界からリトルエンディアンの 2 バイトを `u16` として読む。
fn read_u16_le(reader: &mut BitReader<'_>) -> Result<u16, FlateError> {
    let bytes = reader.take_bytes(STORED_LENGTH_FIELD_LEN)?;
    let low = bytes.first().copied().unwrap_or(0);
    let high = bytes.get(1).copied().unwrap_or(0);
    Ok(u16::from(low) | (u16::from(high) << 8))
}
