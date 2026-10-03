use super::*;

#[test]
fn opens_lazily_and_resolves_direct_free_missing_and_nested_references() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Next 2 0 R >>");
    pdf.object(2, 0, "42");
    pdf.object(3, 0, "[ broken");
    let data = pdf.finish("4 1\n0 1 f\n");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    assert_eq!(resolver.trailer().unwrap().root(), reference(1, 0));
    let dict = resolver.resolve(reference(1, 0)).unwrap();
    let PdfObject::Dictionary(dict) = dict.as_ref() else {
        panic!("dictionary")
    };
    let PdfObject::Reference(next) = dict.get(b"Next".as_slice()).unwrap() else {
        panic!("reference")
    };
    assert_eq!(*resolver.resolve(*next).unwrap(), PdfObject::from(42));
    for n in [4, 99] {
        assert_eq!(*resolver.resolve(reference(n, 0)).unwrap(), PdfObject::Null);
    }
    assert!(matches!(
        resolver.resolve(reference(3, 0)),
        Err(ResolveError::Parse(_))
    ));
    assert_eq!(
        *resolver.resolve_value(PdfObject::from(true)).unwrap(),
        PdfObject::from(true)
    );
    assert_eq!(
        *resolver
            .resolve_value(PdfObject::Reference(reference(2, 0)))
            .unwrap(),
        PdfObject::from(42)
    );
}

#[test]
fn generations_headers_offsets_and_prefix_are_checked() {
    let mut pdf = PdfFixture::new();
    let position = pdf.object(1, 2, "17");
    let data = pdf.finish(&format!(
        "2 1\n{position} 2 n\n3 1\n999999 0 n\n4 1\n{position} 0 n\n"
    ));
    let mut prefixed = b"prefix".to_vec();
    prefixed.extend(data);
    let mut resolver = ObjectResolver::open(&prefixed).unwrap();
    assert_eq!(
        *resolver.resolve(reference(1, 2)).unwrap(),
        PdfObject::from(17)
    );
    assert!(matches!(
        resolver.resolve(reference(1, 0)),
        Err(ResolveError::GenerationMismatch { .. })
    ));
    assert!(matches!(
        resolver.resolve(reference(2, 2)),
        Err(ResolveError::ObjectMismatch { .. })
    ));
    assert!(matches!(
        resolver.resolve(reference(3, 0)),
        Err(ResolveError::InvalidOffset(_))
    ));
    assert!(matches!(
        resolver.resolve(reference(4, 0)),
        Err(ResolveError::ObjectMismatch { .. })
    ));
}

#[test]
fn refuses_encrypted_documents_before_resolving() {
    let data =
        b"%PDF-1.7\nxref\ntrailer\n<< /Size 2 /Root 1 0 R /Encrypt 2 0 R >>\nstartxref\n9\n%%EOF";
    assert!(matches!(
        ObjectResolver::open(data),
        Err(ResolveError::EncryptedDocument)
    ));
}
