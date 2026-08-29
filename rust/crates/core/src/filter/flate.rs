//! `/FlateDecode`（zlib / DEFLATE）の展開。
//!
//! ISO 32000-1:2008 §7.4.4 / RFC 1950（zlib）/ RFC 1951（DEFLATE）に対応する。
//! `docs/specs/07_compression_filters.md` §3.1 は外部ライブラリとの連携を前提に
//! 書かれているが、本クレートは外部 crate 依存ゼロの制約により自前実装する。

// 展開の実装詳細はクレート内に閉じる。外へ出すのは decode_zlib / decode_raw の 2 本だけで、
// ビットリーダ・符号表・定数表を公開 API に載せると互換性の負債になる
// （`lexer` が `mod cursor;` / `pub(crate) mod byte_ops;` としているのと同じ扱い）。
pub(crate) mod adler32;
pub(crate) mod back_reference;
pub(crate) mod bit_reader;
pub(crate) mod huffman;
pub(crate) mod inflate;
pub(crate) mod symbols;
pub(crate) mod zlib_header;

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;
use adler32::Adler32;
use bit_reader::BitReader;
use zlib_header::ZlibHeader;

/// zlib トレーラ（Adler-32）のバイト数。
const ADLER32_LEN: usize = 4;

/// zlib 形式（RFC 1950）のバイト列を展開する。
///
/// ヘッダ 2 バイトを検証し、DEFLATE 本体を展開し、末尾 4 バイトの Adler-32 と
/// 展開結果の実測値を突き合わせる。
///
/// # Errors
///
/// - [`FlateErrorKind::UnexpectedEof`] — ヘッダ・本体・トレーラのいずれかで入力が尽きた
/// - [`FlateErrorKind::UnsupportedCompressionMethod`] — CM が 8 ではない
/// - [`FlateErrorKind::WindowTooLarge`] — CINFO が 7 を超える
/// - [`FlateErrorKind::InvalidHeaderCheck`] — 検査値が 31 の倍数でない
/// - [`FlateErrorKind::PresetDictionaryUnsupported`] — FDICT が立っている
/// - [`FlateErrorKind::ChecksumMismatch`] — Adler-32 が一致しない
/// - DEFLATE 本体の展開で検出した破損（ブロック種別・Huffman 符号・後方参照の距離）
///
/// # panic
///
/// panic しない契約（添字アクセスと `unwrap` を使わない）。
///
/// [`FlateErrorKind::UnexpectedEof`]: crate::filter::error::FlateErrorKind::UnexpectedEof
/// [`FlateErrorKind::UnsupportedCompressionMethod`]: crate::filter::error::FlateErrorKind::UnsupportedCompressionMethod
/// [`FlateErrorKind::WindowTooLarge`]: crate::filter::error::FlateErrorKind::WindowTooLarge
/// [`FlateErrorKind::InvalidHeaderCheck`]: crate::filter::error::FlateErrorKind::InvalidHeaderCheck
/// [`FlateErrorKind::PresetDictionaryUnsupported`]: crate::filter::error::FlateErrorKind::PresetDictionaryUnsupported
/// [`FlateErrorKind::ChecksumMismatch`]: crate::filter::error::FlateErrorKind::ChecksumMismatch
pub fn decode_zlib(input: &[u8]) -> Result<Vec<u8>, FlateError> {
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

/// raw deflate（RFC 1951 のみ、zlib ラッパ無し）のバイト列を展開する。
///
/// ヘッダ検証もチェックサム検証も行わない。
///
/// # Errors
///
/// DEFLATE 本体の展開で検出した破損（ブロック種別・Huffman 符号・後方参照の距離）。
///
/// # panic
///
/// panic しない契約。
pub fn decode_raw(input: &[u8]) -> Result<Vec<u8>, FlateError> {
    let mut reader = BitReader::new(input);
    inflate::inflate(&mut reader)
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
