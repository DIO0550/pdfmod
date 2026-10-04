use super::*;
use crate::{
    catalog::error::CatalogErrorKind, file::version::PdfVersion, object::object_kind::ObjectKind,
};

#[test]
fn follows_root_without_resolving_children_and_keeps_header_version() {
    let mut pdf = PdfFixture::new();
    pdf.object(
        1,
        0,
        "<< /Type /Catalog /Pages 2 0 R /Names 3 0 R /Version /1.4 >>",
    );
    pdf.object(2, 0, "[ malformed");
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    let catalog = resolver.catalog().unwrap();
    assert_eq!(catalog.pages(), reference(2, 0));
    assert_eq!(catalog.version(), PdfVersion::V1_7);
    assert_eq!(
        catalog.entry(b"Names"),
        Some(&PdfObject::Reference(reference(3, 0)))
    );
    assert!(std::ptr::eq(
        catalog.object(),
        resolver.resolve(reference(1, 0)).unwrap().as_ref()
    ));
}

#[test]
fn follows_root_reference_chains_and_applies_newer_catalog_version() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "3 0 R");
    pdf.object(3, 0, "<< /Type /Catalog /Pages 2 0 R /Version /2.0 >>");
    let data = pdf.finish("");
    assert_eq!(
        ObjectResolver::open(&data)
            .unwrap()
            .catalog()
            .unwrap()
            .version(),
        PdfVersion::V2_0
    );
}

#[test]
fn missing_or_free_root_is_a_positioned_structural_error() {
    for extra in ["", "1 1\n0 1 f\n"] {
        let data = PdfFixture::new().finish(extra);
        let mut resolver = ObjectResolver::open(&data).unwrap();
        let position = resolver.trailer().unwrap().position();
        let error = resolver.catalog().unwrap_err();
        assert_eq!(error.position(), position);
        assert!(position.value() > 0);
        assert_eq!(
            error.kind(),
            &CatalogErrorKind::NotADictionary {
                actual: ObjectKind::Null
            }
        );
    }
}

#[test]
fn root_resolution_failure_preserves_cause_and_reference_source_position() {
    for body in ["[ malformed", "1 0 R"] {
        let mut pdf = PdfFixture::new();
        pdf.object(1, 0, body);
        let mut data = b"prefix\n".to_vec();
        data.extend(pdf.finish(""));
        let mut resolver = ObjectResolver::open(&data).unwrap();
        let position = resolver.trailer().unwrap().position();
        let start = usize::try_from(position.value()).unwrap();
        assert_eq!(&data[start..start + 2], b"<<");
        let error = resolver.catalog().unwrap_err();
        assert_eq!(error.position(), position);
        assert!(matches!(
            error.kind(),
            CatalogErrorKind::RootResolutionFailed(ResolveError::Parse(_) | ResolveError::Cycle(_))
        ));
    }
}

#[test]
fn root_non_dictionary_and_invalid_catalog_report_structure_errors() {
    for (body, expected) in [
        (
            "42",
            CatalogErrorKind::NotADictionary {
                actual: ObjectKind::Integer,
            },
        ),
        (
            "<< /Type /Catalog >>",
            CatalogErrorKind::MissingRequiredKey {
                key: crate::catalog::key::CatalogKey::Pages,
            },
        ),
    ] {
        let mut pdf = PdfFixture::new();
        pdf.object(1, 0, body);
        let data = pdf.finish("");
        let mut resolver = ObjectResolver::open(&data).unwrap();
        let error = resolver.catalog().unwrap_err();
        assert_eq!(error.kind(), &expected);
        assert_eq!(error.position(), resolver.trailer().unwrap().position());
    }
}

#[test]
fn resolver_without_trailer_returns_explicit_error() {
    let data = b"prefix\n%PDF-1.7\n";
    let header = PdfHeader::parse(data).unwrap();
    let mut resolver = ObjectResolver::new(data, header, XRefTable::new());
    let error = resolver.catalog().unwrap_err();
    assert_eq!(error.kind(), &CatalogErrorKind::MissingTrailer);
    assert_eq!(error.position(), ByteOffset::new(7));
}

#[test]
fn catalog_in_object_stream_is_resolved_from_xref_stream() {
    let mut pdf = PdfFixture::new();
    let contents = "1 0 << /Type /Catalog /Pages 2 0 R >>";
    let parent = pdf.object(
        8,
        0,
        &format!(
            "<< /Type /ObjStm /N 1 /First 4 /Length {} >>\nstream\n{contents}\nendstream",
            contents.len()
        ),
    );
    let start = pdf.data.len();
    pdf.data.extend_from_slice(b"9 0 obj\n<< /Type /XRef /Size 10 /Root 1 0 R /W [1 2 1] /Index [1 1 8 1] /Length 8 >>\nstream\n");
    pdf.data.extend_from_slice(&[2, 0, 8, 0, 1]);
    pdf.data
        .extend_from_slice(&u16::try_from(parent).unwrap().to_be_bytes());
    pdf.data.push(0);
    pdf.data
        .extend_from_slice(format!("\nendstream\nendobj\nstartxref\n{start}\n%%EOF\n").as_bytes());
    assert_eq!(
        ObjectResolver::open(&pdf.data)
            .unwrap()
            .catalog()
            .unwrap()
            .pages(),
        reference(2, 0)
    );
}
