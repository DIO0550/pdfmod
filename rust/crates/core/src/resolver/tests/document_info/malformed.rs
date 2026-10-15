use super::*;

#[test]
fn invalid_encoding_in_each_text_field_does_not_drop_other_fields() {
    for key in [
        "Title", "Author", "Subject", "Keywords", "Creator", "Producer",
    ] {
        let info = parse(&format!("<< /{key} <FEFF D800> /ModDate (D:2026) >>"));
        let result = match key {
            "Title" => info.title(),
            "Author" => info.author(),
            "Subject" => info.subject(),
            "Keywords" => info.keywords(),
            "Creator" => info.creator(),
            "Producer" => info.producer(),
            _ => unreachable!(),
        };
        let Err(InfoValueError::TextDecode(error)) = result else {
            panic!("{key}: {result:?}");
        };
        assert_eq!(
            error.kind(),
            TextDecodeErrorKind::UnpairedSurrogate { unit: 0xD800 }
        );
        assert_eq!(error.offset().value(), 2);
        assert_eq!(info.mod_date().unwrap().unwrap().year(), 2026);
    }
}

#[test]
fn multiple_broken_encodings_keep_normal_fields_and_original_bytes() {
    let info = parse(
        "<< /Title <EFBBBF FF> /Author <FEFF 00> /Subject <7F>
        /Keywords (intact) /Creator (app) /Producer (library) >>",
    );
    assert!(
        matches!(info.title(), Err(InfoValueError::TextDecode(error))
        if matches!(error.kind(), TextDecodeErrorKind::InvalidUtf8(_)))
    );
    assert!(
        matches!(info.author(), Err(InfoValueError::TextDecode(error))
        if error.kind() == TextDecodeErrorKind::OddUtf16Length)
    );
    assert!(
        matches!(info.subject(), Err(InfoValueError::TextDecode(error))
        if error.kind() == TextDecodeErrorKind::UndefinedPdfDocByte { byte: 0x7F })
    );
    assert_eq!(text(info.keywords()), Some("intact"));
    assert_eq!(text(info.creator()), Some("app"));
    assert_eq!(text(info.producer()), Some("library"));
    assert_eq!(
        info.entry(b"Title")
            .unwrap()
            .as_pdf_string()
            .unwrap()
            .as_bytes(),
        b"\xEF\xBB\xBF\xFF"
    );
}

#[test]
fn malformed_dates_are_field_errors_and_do_not_discard_valid_text() {
    for date in [
        "",
        "garbage",
        "D:20260230",
        "D:202613",
        "D:20261013240000",
        "D:2026junk",
    ] {
        let info = parse(&format!(
            "<< /CreationDate ({date}) /ModDate (D:20261013) /Title (valid) >>"
        ));
        assert_eq!(info.creation_date(), Err(&InfoValueError::InvalidDate));
        assert_eq!(info.mod_date().unwrap().unwrap().day(), Some(13));
        assert_eq!(text(info.title()), Some("valid"));
    }
    let info = parse("<< /CreationDate (D:2026) /ModDate <FEFF0032> >>");
    assert_eq!(info.mod_date(), Err(&InfoValueError::InvalidDate));
    assert_eq!(info.creation_date().unwrap().unwrap().year(), 2026);
}

#[test]
fn wrong_types_are_errors_instead_of_missing_values_or_trapped_defaults() {
    let info = parse(
        "<< /Title 42 /Author /Name /Subject true /Keywords []
        /Creator << >> /Producer /App /CreationDate /Date /ModDate 0 /Trapped true >>",
    );
    for (result, actual) in [
        (info.title(), ObjectKind::Integer),
        (info.author(), ObjectKind::Name),
        (info.subject(), ObjectKind::Boolean),
        (info.keywords(), ObjectKind::Array),
        (info.creator(), ObjectKind::Dictionary),
        (info.producer(), ObjectKind::Name),
    ] {
        assert_eq!(result, Err(&InfoValueError::InvalidType { actual }));
    }
    assert_eq!(
        info.creation_date(),
        Err(&InfoValueError::InvalidType {
            actual: ObjectKind::Name
        })
    );
    assert_eq!(
        info.mod_date(),
        Err(&InfoValueError::InvalidType {
            actual: ObjectKind::Integer
        })
    );
    assert_eq!(
        info.trapped(),
        Err(&InfoValueError::InvalidType {
            actual: ObjectKind::Boolean
        })
    );
}

#[test]
fn info_structure_and_resolution_errors_keep_trailer_position() {
    for body in ["42", "[ malformed", "5 0 R"] {
        let mut pdf = PdfFixture::new();
        pdf.object(5, 0, body);
        let mut data = b"prefix\n".to_vec();
        data.extend(pdf.finish_with_trailer("", "/Info 5 0 R"));
        let mut resolver = ObjectResolver::open(&data).unwrap();
        let position = resolver.trailer().unwrap().position();
        let error = resolver.document_info().unwrap_err();
        assert_eq!(error.position(), position);
        assert!(position.value() > 7);
        match body {
            "42" => assert_eq!(
                error.kind(),
                &DocumentInfoErrorKind::NotADictionary {
                    actual: ObjectKind::Integer
                }
            ),
            "[ malformed" => assert!(matches!(
                error.kind(),
                DocumentInfoErrorKind::Resolution(ResolveError::Parse(_))
            )),
            "5 0 R" => assert!(matches!(
                error.kind(),
                DocumentInfoErrorKind::Resolution(ResolveError::Cycle(_))
            )),
            _ => unreachable!(),
        }
    }
}

#[test]
fn resolver_without_trailer_is_an_explicit_error() {
    let data = b"prefix\n%PDF-1.7\n";
    let header = PdfHeader::parse(data).unwrap();
    let mut resolver = ObjectResolver::new(data, header, XRefTable::new());
    let error = resolver.document_info().unwrap_err();
    assert_eq!(error.kind(), &DocumentInfoErrorKind::MissingTrailer);
    assert_eq!(error.position(), ByteOffset::new(7));
}
