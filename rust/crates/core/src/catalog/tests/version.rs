use super::*;

#[test]
fn uses_the_newer_of_header_and_catalog_versions() {
    for (declared, expected) in [
        ("1.0", PdfVersion::V1_4),
        ("1.3", PdfVersion::V1_4),
        ("1.4", PdfVersion::V1_4),
        ("1.7", PdfVersion::V1_7),
        ("2.0", PdfVersion::V2_0),
    ] {
        let input = format!("<< /Type /Catalog /Pages 2 0 R /Version /{declared} >>");
        let catalog = parse(input.as_bytes()).unwrap();
        assert_eq!(catalog.version(), expected);
        assert_eq!(
            catalog.declared_version(),
            PdfVersion::from_bytes(declared.as_bytes())
        );
    }
}

#[test]
fn null_version_is_absent() {
    let catalog = parse(b"<< /Type /Catalog /Pages 2 0 R /Version null >>").unwrap();
    assert_eq!(catalog.declared_version(), None);
    assert_eq!(catalog.version(), PdfVersion::V1_4);
}

#[test]
fn rejects_invalid_version_names_and_types() {
    for value in ["/1.8", "/3.0", "/garbage", "/1.70"] {
        let input = format!("<< /Type /Catalog /Pages 2 0 R /Version {value} >>");
        assert_eq!(
            parse(input.as_bytes()).unwrap_err().kind(),
            &CatalogErrorKind::InvalidVersion
        );
    }
    let error = parse(b"<< /Type /Catalog /Pages 2 0 R /Version (1.7) >>").unwrap_err();
    assert_eq!(
        error.kind(),
        &CatalogErrorKind::InvalidKeyType {
            key: CatalogKey::Version,
            actual: ObjectKind::String
        }
    );
}
