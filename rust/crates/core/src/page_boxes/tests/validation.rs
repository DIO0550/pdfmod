use super::*;

#[test]
fn reports_missing_media_box() {
    for input in [b"<< >>".as_slice(), b"<< /MediaBox null >>"] {
        let error = parse(input).unwrap_err();
        assert_eq!(error.key(), PageBoxKey::MediaBox);
        assert_eq!(error.kind(), &PageBoxErrorKind::MissingMediaBox);
        assert_eq!(error.position(), ByteOffset::new(123));
    }
}

#[test]
fn malformed_optional_values_never_silently_default() {
    for (name, key) in [
        ("MediaBox", PageBoxKey::MediaBox),
        ("CropBox", PageBoxKey::CropBox),
        ("BleedBox", PageBoxKey::BleedBox),
        ("TrimBox", PageBoxKey::TrimBox),
        ("ArtBox", PageBoxKey::ArtBox),
    ] {
        for (value, expected) in [
            (
                "1 0 R",
                PageBoxErrorKind::NotAnArray {
                    actual: ObjectKind::Reference,
                },
            ),
            (
                "false",
                PageBoxErrorKind::NotAnArray {
                    actual: ObjectKind::Boolean,
                },
            ),
            (
                "[0 0 10]",
                PageBoxErrorKind::InvalidRectangle(RectangleError::InvalidLength { actual: 3 }),
            ),
            (
                "[0 0 1 0 R 10]",
                PageBoxErrorKind::InvalidRectangle(RectangleError::InvalidElement {
                    index: 2,
                    actual: ObjectKind::Reference,
                }),
            ),
        ] {
            let media = if key == PageBoxKey::MediaBox {
                ""
            } else {
                "/MediaBox [0 0 100 200]"
            };
            let input = format!("<< {media} /{name} {value} >>");
            let error = parse(input.as_bytes()).unwrap_err();
            assert_eq!(error.key(), key);
            assert_eq!(error.kind(), &expected);
            assert_eq!(error.position(), ByteOffset::new(123));
        }
    }
}
