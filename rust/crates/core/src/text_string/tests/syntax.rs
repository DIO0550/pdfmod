use super::{strict, TextDecodeErrorKind};
use crate::{
    object::{PdfObject, StringEncoding},
    parser::Parser,
};

#[test]
fn literal_octal_and_hex_syntax_feed_the_same_text_decoder() {
    for (input, encoding) in [
        (
            b"(\\376\\377\\145\\345\\147\\054)".as_slice(),
            StringEncoding::Literal,
        ),
        (b"<FEFF65E5672C>", StringEncoding::Hex),
    ] {
        let PdfObject::String(raw) = Parser::new(input).parse_object().unwrap() else {
            panic!("string expected")
        };
        assert_eq!(raw.encoding(), encoding);
        let text = strict(raw.as_bytes()).unwrap();
        assert_eq!(text.as_str(), "日本");
        let owned: String = text.into();
        assert_eq!(owned, "日本");
        assert_eq!(raw.as_bytes(), b"\xFE\xFF\x65\xE5\x67\x2C");
    }
}

#[test]
fn parser_keeps_binary_string_valid_until_text_is_explicitly_requested() {
    let PdfObject::String(raw) = Parser::new(b"<007F9FAD>").parse_object().unwrap() else {
        panic!("string expected")
    };
    assert_eq!(raw.as_bytes(), b"\x00\x7F\x9F\xAD");
    let error = strict(raw.as_bytes()).unwrap_err();
    assert_eq!(
        error.kind(),
        TextDecodeErrorKind::UndefinedPdfDocByte { byte: 0 }
    );
    assert_eq!(error.offset().value(), 0);
}

#[test]
fn odd_hex_digit_padding_is_distinct_from_odd_utf16_byte_length() {
    let PdfObject::String(raw) = Parser::new(b"<FEFF004>").parse_object().unwrap() else {
        panic!("string expected")
    };
    assert_eq!(strict(raw.as_bytes()).unwrap().as_str(), "@");
    let PdfObject::String(raw) = Parser::new(b"<FEFF00>").parse_object().unwrap() else {
        panic!("string expected")
    };
    assert_eq!(
        strict(raw.as_bytes()).unwrap_err().kind(),
        TextDecodeErrorKind::OddUtf16Length
    );
}
