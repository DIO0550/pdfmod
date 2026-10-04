use super::{replaced, strict, TextDecodeErrorKind};

#[test]
fn preserves_unicode_nul_and_language_escape_without_normalization() {
    let payload = "日本😀\0\u{1B}jaJP\u{1B}e\u{301}";
    let bytes = [b"\xEF\xBB\xBF".as_slice(), payload.as_bytes()].concat();
    assert_eq!(strict(&bytes).unwrap().as_str(), payload);
    assert_eq!(replaced(&bytes), payload);
}

#[test]
fn rejects_malformed_utf8_and_preserves_valid_neighbors() {
    for (payload, expected) in [
        (b"A\xFFB".as_slice(), "A�B"),
        (b"A\xC0\xAFB", "A��B"),
        (b"A\xED\xA0\x80B", "A���B"),
        (b"A\xF4\x90\x80\x80B", "A����B"),
        (b"A\xE3\x81B", "A�B"),
        (b"A\xE3\x81", "A�"),
        (b"A\x80B", "A�B"),
    ] {
        let bytes = [b"\xEF\xBB\xBF".as_slice(), payload].concat();
        let error = strict(&bytes).unwrap_err();
        assert!(matches!(error.kind(), TextDecodeErrorKind::InvalidUtf8(_)));
        assert_eq!(error.offset().value(), 4);
        assert_eq!(replaced(&bytes), expected);
    }
}

#[test]
fn malformed_payload_does_not_fall_back_to_pdfdocencoding() {
    let error = strict(b"\xEF\xBB\xBF\xE6\x97\xA5\xA0").unwrap_err();
    assert_eq!(error.offset().value(), 6);
    assert!(matches!(error.kind(), TextDecodeErrorKind::InvalidUtf8(_)));
    assert_eq!(replaced(b"\xEF\xBB\xBF\xE6\x97\xA5\xA0"), "日�");
}
