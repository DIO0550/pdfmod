//! `/FlateDecode`（zlib / DEFLATE）の展開。
//!
//! ISO 32000-1:2008 §7.4.4 / RFC 1950（zlib）/ RFC 1951（DEFLATE）に対応する。
//! `docs/specs/07_compression_filters.md` §3.1 は外部ライブラリとの連携を前提に
//! 書かれているが、本クレートは外部 crate 依存ゼロの制約により自前実装する。

// 本ファイルは公開 API 2 本の入口だけを持つ。zlib ラッパ（RFC 1950）の解釈は zlib、
// DEFLATE 本体（RFC 1951）の展開は inflate と、その下の各モジュールが受け持つ。
// 実装詳細はクレート内に閉じる。外へ出すのは decode_zlib / decode_raw の 2 本だけで、
// ビットリーダ・符号表・定数表を公開 API に載せると互換性の負債になる
// （`lexer` が `mod cursor;` / `pub(crate) mod byte_ops;` としているのと同じ扱い）。
pub(crate) mod back_reference;
pub(crate) mod bit_reader;
pub(crate) mod huffman;
pub(crate) mod inflate;
pub(crate) mod symbols;
pub(crate) mod zlib;

use crate::filter::error::FlateError;
use bit_reader::BitReader;

/// zlib 形式（RFC 1950）のバイト列を展開する。
///
/// ヘッダ 2 バイトを検証し、DEFLATE 本体を展開し、末尾 4 バイトの Adler-32 と
/// 展開結果の実測値を突き合わせる。
///
/// # メモリ
///
/// 展開結果を全量 [`Vec<u8>`] に保持する。**展開後サイズの上限は設けていない**ため、
/// 高圧縮率の入力（いわゆる zip bomb）では入力サイズに対して桁違いのメモリを確保しうる。
/// 信頼できない PDF を扱う呼び出し側は、`/Length` やストリームの用途から妥当な上限を
/// 決め、この関数へ渡す前に入力サイズを制限すること。上限を本関数に持たせないのは、
/// 妥当なサイズの判断が `/Filter` と `/DecodeParms` を解釈するフィルタ層の責務であり、
/// ここに定数を置くと二重の上限になるため。
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
    zlib::decode(input)
}

/// raw deflate（RFC 1951 のみ、zlib ラッパ無し）のバイト列を展開する。
///
/// ヘッダ検証もチェックサム検証も行わない。
///
/// # メモリ
///
/// [`decode_zlib`] と同じく展開結果を全量保持し、展開後サイズの上限は設けていない。
/// 信頼できない入力に対する上限は呼び出し側で設けること。
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

#[cfg(test)]
mod tests;
