//! zlib ヘッダ（CMF / FLG）の検証。RFC 1950 §2.2 に対応する。

use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateError;

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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::filter::error::FlateErrorKind;

    // 典型的な zlib ヘッダを受理し、CM と CINFO を取り出すことを確認する。
    #[test]
    fn typical_headers_are_accepted() {
        // 0x78 0x01 は無圧縮寄り、0x78 0xDA は最高圧縮レベルで生成されるヘッダ
        for bytes in [[0x78, 0x01], [0x78, 0xDA]] {
            assert_eq!(
                ZlibHeader::parse(&bytes, ByteOffset::new(0)),
                Ok(ZlibHeader {
                    compression_method: 8,
                    window_log: 7,
                }),
                "header {bytes:02X?} should be accepted"
            );
        }
    }

    // CM が deflate(8) 以外のヘッダを拒否することを確認する。
    #[test]
    fn non_deflate_compression_method_is_rejected() {
        // 0x77: CM=7（deflate ではない）、FCHECK は 0x77 0x09 で 31 の倍数
        let result = ZlibHeader::parse(&[0x77, 0x09], ByteOffset::new(0));

        assert_eq!(
            result,
            Err(FlateError::unsupported_compression_method_at(
                ByteOffset::new(0),
                7
            ))
        );
    }

    // CINFO が 7 を超える（32KB より大きいウィンドウを要求する）ヘッダを拒否することを確認する。
    #[test]
    fn window_larger_than_32kb_is_rejected() {
        // 0x88: CINFO=8（ウィンドウ 64KB）
        let result = ZlibHeader::parse(&[0x88, 0x1C], ByteOffset::new(0));

        assert_eq!(
            result,
            Err(FlateError::window_too_large_at(ByteOffset::new(0), 8))
        );
    }

    // 検査値が 31 の倍数にならないヘッダを拒否することを確認する。
    #[test]
    fn header_check_not_multiple_of_31_is_rejected() {
        // 0x7802 = 30722 は 31 で割り切れない
        let result = ZlibHeader::parse(&[0x78, 0x02], ByteOffset::new(0));

        assert_eq!(
            result,
            Err(FlateError::invalid_header_check_at(
                ByteOffset::new(1),
                0x7802
            ))
        );
    }

    // FDICT が立つ（preset dictionary を使う）ヘッダを拒否することを確認する。
    #[test]
    fn preset_dictionary_header_is_rejected() {
        // 0x78 0x3F: FDICT=1、0x783F = 30783 は 31 の倍数
        let result = ZlibHeader::parse(&[0x78, 0x3F], ByteOffset::new(0));

        assert_eq!(
            result,
            Err(FlateError::preset_dictionary_unsupported_at(
                ByteOffset::new(1)
            ))
        );
    }

    // ウィンドウ上限の境界（CINFO=7 は受理、CINFO=8 は拒否）を確認する。
    #[test]
    fn window_log_boundary_accepts_seven_and_rejects_eight() {
        assert!(ZlibHeader::parse(&[0x78, 0x01], ByteOffset::new(0)).is_ok());

        assert!(matches!(
            ZlibHeader::parse(&[0x88, 0x1C], ByteOffset::new(0)),
            Err(FlateError {
                kind: FlateErrorKind::WindowTooLarge { actual: 8 },
                ..
            })
        ));
    }

    // 2 バイトに満たない入力が UnexpectedEof になり、位置が欠けたバイトを指すことを確認する。
    #[test]
    fn truncated_header_reports_unexpected_eof() {
        let cases: [(&[u8], u64); 2] = [(&[], 0), (&[0x78], 1)];

        for (bytes, expected_position) in cases {
            assert_eq!(
                ZlibHeader::parse(bytes, ByteOffset::new(0)),
                Err(FlateError::unexpected_eof_at(ByteOffset::new(
                    expected_position
                ))),
                "header {bytes:02X?} should report eof at {expected_position}"
            );
        }
    }
}
