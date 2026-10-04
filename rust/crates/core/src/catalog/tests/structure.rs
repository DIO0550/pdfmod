use super::*;

#[test]
fn minimal_catalog_exposes_pages_and_defaults() {
    let catalog = parse(b"<< /Type /Catalog /Pages 2 3 R >>").unwrap();
    assert_eq!(catalog.pages().target().object_number().value(), 2);
    assert_eq!(catalog.pages().target().generation_number().value(), 3);
    assert_eq!(catalog.declared_version(), None);
    assert_eq!(catalog.version(), PdfVersion::V1_4);
    assert_eq!(catalog.page_layout(), PageLayout::SinglePage);
    assert_eq!(catalog.page_mode(), PageMode::UseNone);
}

#[test]
fn required_keys_must_exist_and_have_the_expected_type() {
    let cases: &[(&[u8], CatalogErrorKind)] = &[
        (
            b"<< /Pages 2 0 R >>",
            CatalogErrorKind::MissingRequiredKey {
                key: CatalogKey::Type,
            },
        ),
        (
            b"<< /Type null /Pages 2 0 R >>",
            CatalogErrorKind::MissingRequiredKey {
                key: CatalogKey::Type,
            },
        ),
        (
            b"<< /Type /Pages /Pages 2 0 R >>",
            CatalogErrorKind::InvalidType,
        ),
        (
            b"<< /Type (Catalog) /Pages 2 0 R >>",
            CatalogErrorKind::InvalidKeyType {
                key: CatalogKey::Type,
                actual: ObjectKind::String,
            },
        ),
        (
            b"<< /Type /Catalog >>",
            CatalogErrorKind::MissingRequiredKey {
                key: CatalogKey::Pages,
            },
        ),
        (
            b"<< /Type /Catalog /Pages null >>",
            CatalogErrorKind::MissingRequiredKey {
                key: CatalogKey::Pages,
            },
        ),
        (
            b"<< /Type /Catalog /Pages <<>> >>",
            CatalogErrorKind::InvalidKeyType {
                key: CatalogKey::Pages,
                actual: ObjectKind::Dictionary,
            },
        ),
        (
            b"<< /Type /Catalog /Pages 2 >>",
            CatalogErrorKind::InvalidKeyType {
                key: CatalogKey::Pages,
                actual: ObjectKind::Integer,
            },
        ),
        (
            b"42",
            CatalogErrorKind::NotADictionary {
                actual: ObjectKind::Integer,
            },
        ),
    ];
    for (input, expected) in cases {
        let error = parse(input).unwrap_err();
        assert_eq!(error.kind(), expected);
        assert_eq!(error.position(), ByteOffset::new(123));
    }
}

#[test]
fn preserves_uninterpreted_references_direct_dictionaries_and_unknown_keys() {
    let input = b"<< /Type /Catalog /Pages 2 0 R /Names 3 0 R /Outlines 4 0 R /AcroForm 5 0 R /VendorKey [6 0 R (data)] /ViewerPreferences << /DisplayDocTitle true >> >>";
    let object = Rc::new(Parser::new(input).parse_object().unwrap());
    let catalog =
        Catalog::from_object(Rc::clone(&object), PdfVersion::V1_7, ByteOffset::new(0)).unwrap();
    assert!(std::ptr::eq(catalog.object(), object.as_ref()));
    for key in [b"Names".as_slice(), b"Outlines", b"AcroForm"] {
        assert!(matches!(catalog.entry(key), Some(PdfObject::Reference(_))));
    }
    assert!(matches!(
        catalog.entry(b"VendorKey"),
        Some(PdfObject::Array(_))
    ));
    assert!(matches!(
        catalog.entry(b"ViewerPreferences"),
        Some(PdfObject::Dictionary(_))
    ));
    assert_eq!(catalog.entry(b"Absent"), None);
    let catalog = parse(
        b"<< /Type /Catalog /Pages 2 0 R /Names << /Dests 3 0 R >> /AcroForm << /Fields [] >> >>",
    )
    .unwrap();
    for key in [b"Names".as_slice(), b"AcroForm"] {
        assert!(matches!(catalog.entry(key), Some(PdfObject::Dictionary(_))));
    }
}
