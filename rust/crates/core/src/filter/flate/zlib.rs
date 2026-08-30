//! zlib ラッパ（RFC 1950）の解釈。
//!
//! zlib 形式は「2 バイトのヘッダ + DEFLATE 本体（RFC 1951）+ 4 バイトの Adler-32」で、
//! 本ファイルはそのうちヘッダとトレーラ、すなわち **DEFLATE を包む層だけ**を受け持つ。
//! 本体の展開は `inflate` に委ねる。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use crate::filter::flate::bit_reader::BitReader;
use crate::filter::flate::inflate;

/// zlib トレーラ（Adler-32）のバイト数。
const ADLER32_LEN: usize = 4;

// ---------------------------------------------------------------------------
// ヘッダ（RFC 1950 §2.2）
// ---------------------------------------------------------------------------

/// deflate を表す圧縮方式（CM）の値。
const COMPRESSION_METHOD_DEFLATE: u8 = 8;

/// 許容するウィンドウ指数（CINFO）の上限。2 の (7 + 8) 乗 = 32KB。
const MAX_WINDOW_LOG: u8 = 7;

/// ヘッダ検査値（CMF と FLG を並べた 16 ビット値）が割り切れるべき値。
const HEADER_CHECK_MODULUS: u16 = 31;

/// FLG の FDICT ビット（preset dictionary の有無）。
const FLG_FDICT_MASK: u8 = 0x20;

/// zlib ヘッダの内容。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct ZlibHeader {
    /// 圧縮方式（CMF の下位 4 ビット）。deflate なら 8。
    pub compression_method: u8,
    /// ウィンドウサイズの指数（CMF の上位 4 ビット）。ウィンドウは 2 の (値 + 8) 乗バイト。
    pub window_log: u8,
}

impl ZlibHeader {
    /// zlib ヘッダのバイト数。
    pub const LEN: usize = 2;

    /// 先頭 2 バイトを zlib ヘッダとして検証する。
    ///
    /// `position` は `bytes` の先頭が入力全体の何バイト目かを表す。エラー位置は
    /// この値を基準に報告する。
    ///
    /// # Errors
    ///
    /// - [`FlateErrorKind::UnexpectedEof`] — `bytes` が 2 バイト未満
    /// - [`FlateErrorKind::UnsupportedCompressionMethod`] — CM が 8 ではない
    /// - [`FlateErrorKind::WindowTooLarge`] — CINFO が 7 を超える
    /// - [`FlateErrorKind::InvalidHeaderCheck`] — CMF と FLG を並べた値が 31 の倍数でない
    /// - [`FlateErrorKind::PresetDictionaryUnsupported`] — FLG の FDICT ビットが立っている
    ///
    /// [`FlateErrorKind::UnexpectedEof`]: crate::filter::error::FlateErrorKind::UnexpectedEof
    /// [`FlateErrorKind::UnsupportedCompressionMethod`]: crate::filter::error::FlateErrorKind::UnsupportedCompressionMethod
    /// [`FlateErrorKind::WindowTooLarge`]: crate::filter::error::FlateErrorKind::WindowTooLarge
    /// [`FlateErrorKind::InvalidHeaderCheck`]: crate::filter::error::FlateErrorKind::InvalidHeaderCheck
    /// [`FlateErrorKind::PresetDictionaryUnsupported`]: crate::filter::error::FlateErrorKind::PresetDictionaryUnsupported
    pub fn parse(bytes: &[u8], position: ByteOffset) -> Result<Self, FlateError> {
        let cmf = bytes
            .first()
            .copied()
            .ok_or_else(|| FlateError::unexpected_eof_at(position))?;
        let flg_position = position.checked_add(ByteOffset::new(1)).unwrap_or(position);
        let flg = bytes
            .get(1)
            .copied()
            .ok_or_else(|| FlateError::unexpected_eof_at(flg_position))?;

        let compression_method = cmf & 0x0F;
        if compression_method != COMPRESSION_METHOD_DEFLATE {
            return Err(FlateError::unsupported_compression_method_at(
                position,
                compression_method,
            ));
        }

        let window_log = cmf >> 4;
        if window_log > MAX_WINDOW_LOG {
            return Err(FlateError::window_too_large_at(position, window_log));
        }

        // FCHECK: CMF と FLG を並べた 16 ビット値が 31 の倍数であること
        let check = (u16::from(cmf) << 8) | u16::from(flg);
        if check % HEADER_CHECK_MODULUS != 0 {
            return Err(FlateError::invalid_header_check_at(flg_position, check));
        }

        // FDICT が立っていると preset dictionary の識別子が続く。本実装は非対応。
        if flg & FLG_FDICT_MASK != 0 {
            return Err(FlateError::preset_dictionary_unsupported_at(flg_position));
        }

        Ok(Self {
            compression_method,
            window_log,
        })
    }
}

// ---------------------------------------------------------------------------
// Adler-32（RFC 1950 §9）
// ---------------------------------------------------------------------------

/// Adler-32 の法（65521、65536 未満の最大の素数）。
const MOD_ADLER: u32 = 65521;

/// Adler-32 の計算状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct Adler32 {
    /// バイト値の総和（初期値 1）。
    sum: u32,
    /// `sum` の総和（初期値 0）。
    sum_of_sums: u32,
}

impl Adler32 {
    /// 初期状態（`sum = 1`、`sum_of_sums = 0`）を作る。
    pub fn new() -> Self {
        Self {
            sum: 1,
            sum_of_sums: 0,
        }
    }

    /// バイト列を取り込んで状態を更新する。
    pub fn update(&mut self, data: &[u8]) {
        for &byte in data {
            self.sum = (self.sum + u32::from(byte)) % MOD_ADLER;
            self.sum_of_sums = (self.sum_of_sums + self.sum) % MOD_ADLER;
        }
    }

    /// 現在のチェックサム値（上位 16 ビットが `sum_of_sums`、下位 16 ビットが `sum`）。
    #[must_use]
    pub fn value(&self) -> u32 {
        (self.sum_of_sums << 16) | self.sum
    }
}

impl Default for Adler32 {
    fn default() -> Self {
        Self::new()
    }
}

// ---------------------------------------------------------------------------
// ラッパの解釈
// ---------------------------------------------------------------------------

/// zlib 形式のバイト列を展開する。
///
/// ヘッダ 2 バイトを検証し、DEFLATE 本体を展開し、末尾 4 バイトの Adler-32 と
/// 展開結果の実測値を突き合わせる。公開 API は [`decode_zlib`] を参照。
///
/// # Errors
///
/// ヘッダ検証・本体の展開・チェックサム照合のいずれかで検出した破損。
///
/// [`decode_zlib`]: crate::filter::flate::decode_zlib
pub fn decode(input: &[u8]) -> Result<Vec<u8>, FlateError> {
    let mut reader = BitReader::new(input);
    let header_bytes = reader.take_bytes(ZlibHeader::LEN)?;
    // ヘッダは検証だけが目的（展開結果を全量保持する実装ではウィンドウサイズを使わない）
    let _header = ZlibHeader::parse(header_bytes, ByteOffset::new(0))?;

    let output = inflate::inflate(&mut reader)?;

    // トレーラはバイト境界から始まる（RFC 1950 §2.2）
    reader.align_to_byte();
    let position = reader.position();
    let trailer = reader.take_bytes(ADLER32_LEN)?;
    let expected = read_be_u32(trailer);

    let mut checksum = Adler32::new();
    checksum.update(&output);
    let actual = checksum.value();
    if expected != actual {
        return Err(FlateError::checksum_mismatch_at(position, expected, actual));
    }
    Ok(output)
}

/// ビッグエンディアンの 4 バイトを `u32` として読む。
///
/// 4 バイト未満のスライスを渡された場合は、足りないぶんを 0 として扱う
/// （呼び出し側は `take_bytes(4)` の戻り値のみを渡す）。
fn read_be_u32(bytes: &[u8]) -> u32 {
    bytes
        .iter()
        .fold(0_u32, |value, &byte| (value << 8) | u32::from(byte))
}

#[cfg(test)]
mod tests;
