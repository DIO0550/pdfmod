use crate::error::pdf_error_code::PdfErrorCode;
use crate::file::header::PdfHeader;

fn assert_invalid_header(input: &[u8]) {
    let error = PdfHeader::parse(input).expect_err("signature should be rejected");
    assert_eq!(error.code(), PdfErrorCode::InvalidHeader);
}

#[test]
fn parse_lowercase_signature_returns_invalid_header() {
    // 小文字のシグネチャを厳密一致として拒否することを確認する
    assert_invalid_header(b"%pdf-1.7\n");
}

#[test]
fn parse_signature_with_space_instead_of_hyphen_returns_invalid_header() {
    // ハイフンが空白になったシグネチャを拒否することを確認する
    assert_invalid_header(b"%PDF 1.7\n");
}

#[test]
fn parse_signature_without_hyphen_returns_invalid_header() {
    // ハイフンの欠けたシグネチャを EOL の有無にかかわらず拒否することを確認する
    for input in [b"%PDF\n".as_slice(), b"%PDF"] {
        assert_invalid_header(input);
    }
}

#[test]
fn parse_signature_without_percent_returns_invalid_header() {
    // 先頭のパーセント記号が欠けたシグネチャを拒否することを確認する
    assert_invalid_header(b"PDF-1.7\n");
}

#[test]
fn parse_signature_with_space_after_percent_returns_invalid_header() {
    // パーセント記号の直後に空白があるシグネチャを拒否することを確認する
    assert_invalid_header(b"% PDF-1.7\n");
}

#[test]
fn parse_png_signature_returns_invalid_header() {
    // PNG のバイナリヘッダを PDF と誤認しないことを確認する
    assert_invalid_header(b"\x89PNG\r\n\x1A\nrest");
}

#[test]
fn parse_short_inputs_returns_invalid_header() {
    // シグネチャ長未満の入力が panic せず拒否されることを確認する
    for input in [b"%PDF".as_slice(), b"%", b""] {
        assert_invalid_header(input);
    }
}

#[test]
fn parse_nul_filled_input_returns_invalid_header() {
    // NUL だけの入力を PDF と誤認しないことを確認する
    assert_invalid_header(&[0; 100]);
}

#[test]
fn parse_high_bit_filled_input_returns_invalid_header() {
    // 高ビットバイトだけの長大な入力を走査上限内で拒否することを確認する
    assert_invalid_header(&[0xFF; 2000]);
}
