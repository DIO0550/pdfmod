use super::{assert_error, replaced, strict, TextDecodeErrorKind};

#[test]
fn special_ranges_match_the_specification() {
    assert_eq!(
        strict(&(0x18..=0x1f).collect::<Vec<_>>()).unwrap().as_str(),
        "˘ˇˆ˙˝˛˚˜"
    );
    assert_eq!(
        strict(&(0x80..=0x9e).collect::<Vec<_>>()).unwrap().as_str(),
        "•†‡…—–ƒ⁄‹›−‰„“”‘’‚™ﬁﬂŁŒŠŸŽıłœšž"
    );
    assert_eq!(strict(b"\xA0").unwrap().as_str(), "€");
}

#[test]
fn every_byte_is_classified_including_undefined_controls() {
    // Annex D の Notes=U を含む未割当集合。SR の TAB/LF/CR は受理する。
    for byte in 0u8..=255 {
        let undefined =
            matches!(byte, 0x00..=0x08 | 0x0b..=0x0c | 0x0e..=0x17 | 0x7f | 0x9f | 0xad);
        if undefined {
            assert_error(
                &[b'A', byte, b'B'],
                TextDecodeErrorKind::UndefinedPdfDocByte { byte },
                1,
            );
            assert_eq!(replaced(&[b'A', byte, b'B']), "A�B");
            continue;
        }
        assert!(strict(&[byte]).is_ok(), "byte {byte:02X}");
        if matches!(byte, 0x09 | 0x0a | 0x0d | 0x20..=0x7e | 0xa1..=0xff) {
            assert_eq!(
                strict(&[byte]).unwrap().as_str(),
                char::from(byte).to_string()
            );
        }
    }
}

#[test]
fn reports_first_undefined_byte_and_replaces_each_one() {
    assert_error(
        b"A\x7F\x9FB\xAD",
        TextDecodeErrorKind::UndefinedPdfDocByte { byte: 0x7f },
        1,
    );
    assert_eq!(replaced(b"A\x7F\x9FB\xAD"), "A��B�");
}
