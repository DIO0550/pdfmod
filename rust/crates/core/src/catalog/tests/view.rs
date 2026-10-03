use super::*;

#[test]
fn parses_all_known_layouts() {
    for (name, expected) in [
        ("SinglePage", PageLayout::SinglePage),
        ("OneColumn", PageLayout::OneColumn),
        ("TwoColumnLeft", PageLayout::TwoColumnLeft),
        ("TwoColumnRight", PageLayout::TwoColumnRight),
        ("TwoPageLeft", PageLayout::TwoPageLeft),
        ("TwoPageRight", PageLayout::TwoPageRight),
    ] {
        let input = format!("<< /Type /Catalog /Pages 2 0 R /PageLayout /{name} >>");
        assert_eq!(parse(input.as_bytes()).unwrap().page_layout(), expected);
    }
}

#[test]
fn parses_all_known_modes() {
    for (name, expected) in [
        ("UseNone", PageMode::UseNone),
        ("UseOutlines", PageMode::UseOutlines),
        ("UseThumbs", PageMode::UseThumbs),
        ("FullScreen", PageMode::FullScreen),
        ("UseOC", PageMode::UseOC),
        ("UseAttachments", PageMode::UseAttachments),
    ] {
        let input = format!("<< /Type /Catalog /Pages 2 0 R /PageMode /{name} >>");
        assert_eq!(parse(input.as_bytes()).unwrap().page_mode(), expected);
    }
}

#[test]
fn unknown_names_use_defaults_but_original_names_are_retained() {
    let catalog =
        parse(b"<< /Type /Catalog /Pages 2 0 R /PageLayout /FutureLayout /PageMode /FutureMode >>")
            .unwrap();
    assert_eq!(catalog.page_layout(), PageLayout::SinglePage);
    assert_eq!(catalog.page_mode(), PageMode::UseNone);
    assert!(
        matches!(catalog.entry(b"PageMode"), Some(PdfObject::Name(name)) if name.as_bytes() == b"FutureMode")
    );
    let catalog =
        parse(b"<< /Type /Catalog /Pages 2 0 R /PageLayout null /PageMode null >>").unwrap();
    assert_eq!(catalog.page_layout(), PageLayout::SinglePage);
    assert_eq!(catalog.page_mode(), PageMode::UseNone);
}

#[test]
fn invalid_types_are_errors_instead_of_unknown_names() {
    for key in [CatalogKey::PageMode, CatalogKey::PageLayout] {
        let name = std::str::from_utf8(key.as_bytes()).unwrap();
        let input = format!("<< /Type /Catalog /Pages 2 0 R /{name} 42 >>");
        assert_eq!(
            parse(input.as_bytes()).unwrap_err().kind(),
            &CatalogErrorKind::InvalidKeyType {
                key,
                actual: ObjectKind::Integer
            }
        );
    }
}
