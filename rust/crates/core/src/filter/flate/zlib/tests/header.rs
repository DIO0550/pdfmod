use super::super::*;
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
