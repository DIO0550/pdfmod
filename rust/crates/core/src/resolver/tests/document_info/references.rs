use super::*;

#[test]
fn info_and_known_fields_follow_indirect_reference_chains() {
    let mut pdf = PdfFixture::new();
    pdf.object(5, 0, "6 0 R");
    pdf.object(
        6,
        0,
        "<< /Title 7 0 R /CreationDate 8 0 R /Trapped 9 0 R >>",
    );
    pdf.object(7, 0, "10 0 R");
    pdf.object(8, 0, "(D:20261013)");
    pdf.object(9, 0, "/False");
    pdf.object(10, 0, "(indirect title)");
    let data = pdf.finish_with_trailer("", "/Info 5 0 R");
    let info = ObjectResolver::open(&data)
        .unwrap()
        .document_info()
        .unwrap();
    assert_eq!(text(info.title()), Some("indirect title"));
    assert_eq!(info.creation_date().unwrap().unwrap().day(), Some(13));
    assert_eq!(info.trapped(), Ok(Trapped::False));
    assert_eq!(
        info.entry(b"Title"),
        Some(&PdfObject::Reference(reference(7, 0)))
    );
}

#[test]
fn broken_field_references_are_local_errors_and_later_fields_survive() {
    let mut pdf = PdfFixture::new();
    pdf.object(
        5,
        0,
        "<< /Title 6 0 R /Author 7 0 R /CreationDate 8 1 R /Trapped 6 0 R /Producer (valid) >>",
    );
    pdf.object(6, 0, "6 0 R");
    pdf.object(7, 0, "[ malformed");
    pdf.object(8, 0, "(D:2026)");
    let data = pdf.finish_with_trailer("", "/Info 5 0 R");
    let info = ObjectResolver::open(&data)
        .unwrap()
        .document_info()
        .unwrap();
    assert!(matches!(
        info.title(),
        Err(InfoValueError::Resolution(ResolveError::Cycle(_)))
    ));
    assert!(matches!(
        info.author(),
        Err(InfoValueError::Resolution(ResolveError::Parse(_)))
    ));
    assert!(matches!(
        info.creation_date(),
        Err(InfoValueError::Resolution(
            ResolveError::GenerationMismatch { .. }
        ))
    ));
    assert!(matches!(
        info.trapped(),
        Err(InfoValueError::Resolution(ResolveError::Cycle(_)))
    ));
    assert_eq!(text(info.producer()), Some("valid"));
}

#[test]
fn null_missing_and_free_info_targets_are_empty() {
    for (body, extra) in [(Some("null"), ""), (None, ""), (None, "5 1\n0 1 f\n")] {
        let mut pdf = PdfFixture::new();
        if let Some(body) = body {
            pdf.object(5, 0, body);
        }
        let data = pdf.finish_with_trailer(extra, "/Info 5 0 R");
        let info = ObjectResolver::open(&data)
            .unwrap()
            .document_info()
            .unwrap();
        assert_empty(&info);
        assert_eq!(info.object(), None);
    }
}

#[test]
fn undefined_and_null_field_references_are_absent() {
    let mut pdf = PdfFixture::new();
    pdf.object(
        5,
        0,
        "<< /Title 6 0 R /Author 7 0 R /CreationDate 8 0 R /Trapped 9 0 R >>",
    );
    pdf.object(7, 0, "null");
    let data = pdf.finish_with_trailer("", "/Info 5 0 R");
    let info = ObjectResolver::open(&data)
        .unwrap()
        .document_info()
        .unwrap();
    assert_empty(&info);
    assert!(info.object().is_some());
}

#[test]
fn info_dictionary_in_object_stream_is_resolved() {
    let mut pdf = PdfFixture::new();
    let contents = "5 0 << /Title (compressed) /ModDate (D:2026) >>";
    let parent = pdf.object(
        8,
        0,
        &format!(
            "<< /Type /ObjStm /N 1 /First 4 /Length {} >>\nstream\n{contents}\nendstream",
            contents.len()
        ),
    );
    let start = pdf.data.len();
    pdf.data.extend_from_slice(b"9 0 obj\n<< /Type /XRef /Size 10 /Root 1 0 R /Info 5 0 R /W [1 2 1] /Index [5 1 8 1] /Length 8 >>\nstream\n");
    pdf.data.extend_from_slice(&[2, 0, 8, 0, 1]);
    pdf.data
        .extend_from_slice(&u16::try_from(parent).unwrap().to_be_bytes());
    pdf.data.push(0);
    pdf.data
        .extend_from_slice(format!("\nendstream\nendobj\nstartxref\n{start}\n%%EOF\n").as_bytes());
    let info = ObjectResolver::open(&pdf.data)
        .unwrap()
        .document_info()
        .unwrap();
    assert_eq!(text(info.title()), Some("compressed"));
    assert_eq!(info.mod_date().unwrap().unwrap().year(), 2026);
}
