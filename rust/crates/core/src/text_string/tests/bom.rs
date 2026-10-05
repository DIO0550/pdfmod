use super::{replaced, strict};

#[test]
fn empty_and_bom_only_are_empty() {
    for bytes in [b"".as_slice(), b"\xFE\xFF", b"\xEF\xBB\xBF"] {
        assert_eq!(strict(bytes).unwrap().as_str(), "");
        assert_eq!(replaced(bytes), "");
    }
}

#[test]
fn detects_three_encodings() {
    for bytes in [
        b"\xA0".as_slice(),
        b"\xFE\xFF\x20\xAC",
        b"\xEF\xBB\xBF\xE2\x82\xAC",
    ] {
        assert_eq!(strict(bytes).unwrap().as_str(), "€");
        assert_eq!(replaced(bytes), "€");
    }
}

#[test]
fn does_not_guess_bomless_unicode_partial_bom_or_little_endian() {
    for (bytes, expected) in [
        (b"\xC3\xA9".as_slice(), "Ã©"),
        (b"\xEF", "ï"),
        (b"\xEF\xBB", "ï»"),
        (b"\xFE", "þ"),
        (b"\xFF\xFE", "ÿþ"),
        (b"A\xEF\xBB\xBF", "Aï»¿"),
    ] {
        assert_eq!(strict(bytes).unwrap().as_str(), expected);
    }
}

#[test]
fn strips_only_the_initial_bom() {
    for bytes in [
        b"\xFE\xFF\xFE\xFF\x00A".as_slice(),
        b"\xEF\xBB\xBF\xEF\xBB\xBFA",
    ] {
        assert_eq!(strict(bytes).unwrap().as_str(), "\u{FEFF}A");
    }
}
