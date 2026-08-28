//! フィルタ復号専用のエラー型。
//!
//! 位置情報（[`ByteOffset`]）は全バリアントで必須。
//! `xref::error::XRefError` と同じフラット構造を採り、
//! 公開境界での `PdfError` への変換（`From` 実装）は後続 Issue に委ねる。

use crate::byte_offset::ByteOffset;

/// フィルタ復号エラーの種別。位置は [`FlateError`] 側が持つ。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum FlateErrorKind {
    /// 必要なビット／バイトを読み切る前に入力が尽きた。
    UnexpectedEof,
    /// zlib ヘッダの CM（圧縮方式）が deflate（8）ではない。
    UnsupportedCompressionMethod {
        /// 実際に読み取った CM の値。
        actual: u8,
    },
    /// zlib ヘッダの CINFO が 7 を超える（ウィンドウが 32KB より大きい）。
    WindowTooLarge {
        /// 実際に読み取った CINFO の値。
        actual: u8,
    },
    /// zlib ヘッダの検査値が 31 の倍数になっていない。
    InvalidHeaderCheck {
        /// 実際の CMF と FLG を並べた 16 ビット値。
        actual: u16,
    },
    /// zlib ヘッダの FDICT が立っている（preset dictionary は非対応）。
    PresetDictionaryUnsupported,
    /// ブロック種別が予約値（BTYPE=11）。
    ReservedBlockType {
        /// 実際に読み取った BTYPE の値。
        actual: u8,
    },
    /// ブロック種別が本 PR ではまだ実装されていない。
    ///
    /// PR① / PR② の途中状態でのみ返る暫定バリアントで、動的 Huffman を実装する
    /// PR③ で削除する。
    UnsupportedBlockType {
        /// 実際に読み取った BTYPE の値。
        actual: u8,
    },
    /// 非圧縮ブロックの LEN と NLEN が補数関係になっていない。
    StoredLengthMismatch {
        /// 実際に読み取った LEN。
        len: u16,
        /// 実際に読み取った NLEN。
        nlen: u16,
    },
    /// Huffman 符号長の集合が過剰（Kraft の不等式を満たさない）。
    OversubscribedHuffman,
    /// どの符号にも一致しないビット列を読んだ。
    InvalidHuffmanCode,
    /// 符号長が 15 ビットを超えている。
    InvalidCodeLength {
        /// 実際の符号長。
        actual: u8,
    },
    /// 符号長符号の復号結果が 0..=18 の範囲外。
    InvalidCodeLengthSymbol {
        /// 実際に復号したシンボル番号。
        actual: u16,
    },
    /// 符号長の繰り返し（コード 16 / 17 / 18）が符号長列の範囲を超える。
    InvalidCodeLengthRepeat,
    /// 長さシンボルが 257..=285 の範囲外（286 / 287 は未使用符号）。
    InvalidLengthSymbol {
        /// 実際に復号したシンボル番号。
        actual: u16,
    },
    /// 距離シンボルが 0..=29 の範囲外（30 / 31 は未使用符号）。
    InvalidDistanceSymbol {
        /// 実際に復号したシンボル番号。
        actual: u16,
    },
    /// 後方参照の距離が既存の出力長、または 32768 を超えている。
    DistanceTooFar {
        /// 要求された距離。
        distance: usize,
        /// その時点で出力済みのバイト数。
        available: usize,
    },
    /// Adler-32 チェックサムが展開結果と一致しない。
    ChecksumMismatch {
        /// zlib トレーラに記録されていた値。
        expected: u32,
        /// 展開結果から計算した値。
        actual: u32,
    },
}

/// フィルタ復号エラー。位置情報を必須で保持する。
///
/// `position` は**圧縮入力の先頭からのバイトオフセット**（エラーを検出したビットを
/// 含むバイトの位置）であり、展開結果の中の位置ではない。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct FlateError {
    /// エラーの種別と付随情報。
    pub kind: FlateErrorKind,
    /// エラー発生位置（圧縮入力の先頭からのバイトオフセット）。
    pub position: ByteOffset,
}

impl FlateError {
    /// 任意の `kind` + `position` でエラーを構築する。
    pub fn new(kind: FlateErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }

    /// [`FlateErrorKind::UnexpectedEof`] を指定位置で構築する。
    pub fn unexpected_eof_at(position: ByteOffset) -> Self {
        Self::new(FlateErrorKind::UnexpectedEof, position)
    }

    /// [`FlateErrorKind::UnsupportedCompressionMethod`] を指定位置・実値で構築する。
    pub fn unsupported_compression_method_at(position: ByteOffset, actual: u8) -> Self {
        Self::new(
            FlateErrorKind::UnsupportedCompressionMethod { actual },
            position,
        )
    }

    /// [`FlateErrorKind::WindowTooLarge`] を指定位置・実値で構築する。
    pub fn window_too_large_at(position: ByteOffset, actual: u8) -> Self {
        Self::new(FlateErrorKind::WindowTooLarge { actual }, position)
    }

    /// [`FlateErrorKind::InvalidHeaderCheck`] を指定位置・実値で構築する。
    pub fn invalid_header_check_at(position: ByteOffset, actual: u16) -> Self {
        Self::new(FlateErrorKind::InvalidHeaderCheck { actual }, position)
    }

    /// [`FlateErrorKind::PresetDictionaryUnsupported`] を指定位置で構築する。
    pub fn preset_dictionary_unsupported_at(position: ByteOffset) -> Self {
        Self::new(FlateErrorKind::PresetDictionaryUnsupported, position)
    }

    /// [`FlateErrorKind::ReservedBlockType`] を指定位置・実値で構築する。
    pub fn reserved_block_type_at(position: ByteOffset, actual: u8) -> Self {
        Self::new(FlateErrorKind::ReservedBlockType { actual }, position)
    }

    /// [`FlateErrorKind::UnsupportedBlockType`] を指定位置・実値で構築する。
    pub fn unsupported_block_type_at(position: ByteOffset, actual: u8) -> Self {
        Self::new(FlateErrorKind::UnsupportedBlockType { actual }, position)
    }

    /// [`FlateErrorKind::StoredLengthMismatch`] を指定位置・実値で構築する。
    pub fn stored_length_mismatch_at(position: ByteOffset, len: u16, nlen: u16) -> Self {
        Self::new(FlateErrorKind::StoredLengthMismatch { len, nlen }, position)
    }

    /// [`FlateErrorKind::OversubscribedHuffman`] を指定位置で構築する。
    pub fn oversubscribed_huffman_at(position: ByteOffset) -> Self {
        Self::new(FlateErrorKind::OversubscribedHuffman, position)
    }

    /// [`FlateErrorKind::InvalidHuffmanCode`] を指定位置で構築する。
    pub fn invalid_huffman_code_at(position: ByteOffset) -> Self {
        Self::new(FlateErrorKind::InvalidHuffmanCode, position)
    }

    /// [`FlateErrorKind::InvalidCodeLength`] を指定位置・実値で構築する。
    pub fn invalid_code_length_at(position: ByteOffset, actual: u8) -> Self {
        Self::new(FlateErrorKind::InvalidCodeLength { actual }, position)
    }

    /// [`FlateErrorKind::InvalidCodeLengthSymbol`] を指定位置・実値で構築する。
    pub fn invalid_code_length_symbol_at(position: ByteOffset, actual: u16) -> Self {
        Self::new(FlateErrorKind::InvalidCodeLengthSymbol { actual }, position)
    }

    /// [`FlateErrorKind::InvalidCodeLengthRepeat`] を指定位置で構築する。
    pub fn invalid_code_length_repeat_at(position: ByteOffset) -> Self {
        Self::new(FlateErrorKind::InvalidCodeLengthRepeat, position)
    }

    /// [`FlateErrorKind::InvalidLengthSymbol`] を指定位置・実値で構築する。
    pub fn invalid_length_symbol_at(position: ByteOffset, actual: u16) -> Self {
        Self::new(FlateErrorKind::InvalidLengthSymbol { actual }, position)
    }

    /// [`FlateErrorKind::InvalidDistanceSymbol`] を指定位置・実値で構築する。
    pub fn invalid_distance_symbol_at(position: ByteOffset, actual: u16) -> Self {
        Self::new(FlateErrorKind::InvalidDistanceSymbol { actual }, position)
    }

    /// [`FlateErrorKind::DistanceTooFar`] を指定位置・実値で構築する。
    pub fn distance_too_far_at(position: ByteOffset, distance: usize, available: usize) -> Self {
        Self::new(
            FlateErrorKind::DistanceTooFar {
                distance,
                available,
            },
            position,
        )
    }

    /// [`FlateErrorKind::ChecksumMismatch`] を指定位置・実値で構築する。
    pub fn checksum_mismatch_at(position: ByteOffset, expected: u32, actual: u32) -> Self {
        Self::new(
            FlateErrorKind::ChecksumMismatch { expected, actual },
            position,
        )
    }
}

#[cfg(test)]
mod tests;
