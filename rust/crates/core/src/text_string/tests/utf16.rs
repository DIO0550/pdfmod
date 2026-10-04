use super::{assert_error, replaced, strict, TextDecodeErrorKind};

#[test]
fn decodes_bmp_surrogate_pairs_and_unicode_boundaries() {
    let bytes =
        b"\xFE\xFF\x00\x00\x65\xE5\x67\x2C\xD8\x3D\xDE\x00\xD8\x00\xDC\x00\xDB\xFF\xDF\xFF\xFF\xFF";
    let expected = "\0日本😀\u{10000}\u{10FFFF}\u{FFFF}";
    assert_eq!(strict(bytes).unwrap().as_str(), expected);
    assert_eq!(replaced(bytes), expected);
}

#[test]
fn rejects_isolated_surrogates_without_eating_valid_following_units() {
    for (bytes, unit, expected) in [
        (b"\xFE\xFF\xD8\x00".as_slice(), 0xd800, "�"),
        (b"\xFE\xFF\xDC\x00", 0xdc00, "�"),
        (b"\xFE\xFF\xD8\x00\x00A", 0xd800, "�A"),
        (b"\xFE\xFF\xDC\x00\x00A", 0xdc00, "�A"),
        (b"\xFE\xFF\xD8\x00\xD8\x3D\xDE\x00", 0xd800, "�😀"),
        (b"\xFE\xFF\xDC\x00\xD8\x00", 0xdc00, "��"),
    ] {
        assert_error(bytes, TextDecodeErrorKind::UnpairedSurrogate { unit }, 2);
        assert_eq!(replaced(bytes), expected);
    }
}

#[test]
fn error_offsets_count_bytes_and_include_bom_and_pairs() {
    assert_error(
        b"\xFE\xFF\x00A\xD8\x3D\xDE\x00\xDC\x00",
        TextDecodeErrorKind::UnpairedSurrogate { unit: 0xdc00 },
        8,
    );
}

#[test]
fn odd_trailing_byte_is_not_silently_dropped_or_zero_padded() {
    for (bytes, offset, expected) in [
        (b"\xFE\xFF\x00".as_slice(), 2, "�"),
        (b"\xFE\xFF\x00A\x42", 4, "A�"),
        (b"\xFE\xFF\xD8\x3D\xDE\x00\x42", 6, "😀�"),
    ] {
        assert_error(bytes, TextDecodeErrorKind::OddUtf16Length, offset);
        assert_eq!(replaced(bytes), expected);
    }
}

#[test]
fn earlier_surrogate_error_precedes_odd_length_error() {
    let bytes = b"\xFE\xFF\x00A\xD8\x00\x00";
    assert_error(
        bytes,
        TextDecodeErrorKind::UnpairedSurrogate { unit: 0xd800 },
        4,
    );
    assert_eq!(replaced(bytes), "A��");
}
