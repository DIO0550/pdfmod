use super::*;

#[test]
fn all_standard_entries_are_decoded() {
    let info = parse(
        "<< /Title (Sample PDF) /Author (John Doe) /Subject (PDF Specification)
        /Keywords (pdf, metadata) /Creator (MyApp) /Producer (MyPDFLib 1.0)
        /CreationDate (D:20260314120000+09'00') /ModDate (D:20261013130000Z)
        /Trapped /True >>",
    );
    assert_eq!(text(info.title()), Some("Sample PDF"));
    assert_eq!(text(info.author()), Some("John Doe"));
    assert_eq!(text(info.subject()), Some("PDF Specification"));
    assert_eq!(text(info.keywords()), Some("pdf, metadata"));
    assert_eq!(text(info.creator()), Some("MyApp"));
    assert_eq!(text(info.producer()), Some("MyPDFLib 1.0"));
    assert_eq!(
        info.creation_date().unwrap(),
        PdfDate::parse("D:20260314120000+09'00'").as_ref()
    );
    let offset = info.creation_date().unwrap().unwrap().offset().unwrap();
    assert_eq!(offset.sign(), Some(OffsetSign::Plus));
    assert_eq!(offset.total_offset_minutes(), 540);
    let modified = info.mod_date().unwrap().unwrap();
    assert_eq!(modified.year(), 2026);
    assert_eq!(modified.month(), Some(10));
    assert_eq!(modified.day(), Some(13));
    assert!(modified.offset().unwrap().is_utc());
    assert_eq!(info.trapped(), Ok(Trapped::True));
}

#[test]
fn missing_and_null_fields_are_absent_and_empty_text_is_present() {
    let info = parse("<< /Title () /Author null /CreationDate null /Trapped null >>");
    assert_eq!(text(info.title()), Some(""));
    assert_eq!(info.author(), Ok(None));
    assert_eq!(info.subject(), Ok(None));
    assert_eq!(info.keywords(), Ok(None));
    assert_eq!(info.creator(), Ok(None));
    assert_eq!(info.producer(), Ok(None));
    assert_eq!(info.creation_date(), Ok(None));
    assert_eq!(info.mod_date(), Ok(None));
    assert_eq!(info.trapped(), Ok(Trapped::Unknown));
}

#[test]
fn empty_dictionary_and_missing_info_have_empty_results() {
    assert_empty(&parse("<< >>"));
    for entry in ["", "/Info null"] {
        let data = PdfFixture::new().finish_with_trailer("", entry);
        let info = ObjectResolver::open(&data)
            .unwrap()
            .document_info()
            .unwrap();
        assert_empty(&info);
        assert_eq!(info.object(), None);
        assert_eq!(info.entry(b"Custom"), None);
    }
    assert_empty(&DocumentInfo::default());
}

#[test]
fn text_encodings_and_lexical_escapes_use_existing_decoder() {
    let info = parse(
        "<< /Title <FEFF65E5672C> /Author <EFBBBF E59C9FE5B185>
        /Subject <80 A0> /Keywords (one\\040two) /Creator (A\\(B\\))
        /Producer <FEFF> >>",
    );
    assert_eq!(text(info.title()), Some("日本"));
    assert_eq!(text(info.author()), Some("土居"));
    assert_eq!(text(info.subject()), Some("•€"));
    assert_eq!(text(info.keywords()), Some("one two"));
    assert_eq!(text(info.creator()), Some("A(B)"));
    assert_eq!(text(info.producer()), Some(""));
}

#[test]
fn abbreviated_dates_preserve_unspecified_components() {
    let info = parse("<< /CreationDate (D:2026) /ModDate <323032363130> >>");
    let created = info.creation_date().unwrap().unwrap();
    assert_eq!(created.year(), 2026);
    assert_eq!(created.month(), None);
    assert_eq!(created.offset(), None);
    let modified = info.mod_date().unwrap().unwrap();
    assert_eq!(modified.month(), Some(10));
    assert_eq!(modified.day(), None);
}

#[test]
fn trapped_names_use_three_states_and_unknown_names_fall_back() {
    for (name, expected) in [
        ("True", Trapped::True),
        ("False", Trapped::False),
        ("Unknown", Trapped::Unknown),
        ("Future", Trapped::Unknown),
        ("true", Trapped::Unknown),
    ] {
        assert_eq!(
            parse(&format!("<< /Trapped /{name} >>")).trapped(),
            Ok(expected)
        );
    }
}

#[test]
fn raw_entries_are_shared_and_unknown_references_are_not_resolved() {
    let mut pdf = PdfFixture::new();
    pdf.object(
        5,
        0,
        "<< /Title (known) /Custom 7 0 R /Vendor << /Flag true >> >>",
    );
    pdf.object(7, 0, "[ malformed");
    let data = pdf.finish_with_trailer("", "/Info 5 0 R");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    let info = resolver.document_info().unwrap();
    assert_eq!(text(info.title()), Some("known"));
    assert_eq!(
        info.entry(b"Custom"),
        Some(&PdfObject::Reference(reference(7, 0)))
    );
    assert!(info.entry(b"Vendor").unwrap().as_dictionary().is_some());
    assert!(std::ptr::eq(
        info.object().unwrap(),
        resolver.resolve(reference(5, 0)).unwrap().as_ref()
    ));
    assert!(info.entry(b"Title").unwrap().as_pdf_string().is_some());
}
