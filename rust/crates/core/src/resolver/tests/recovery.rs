use super::*;
use crate::error::PdfErrorCode;
use crate::resolver::recovery::{RecoveryMethod, RecoveryWarning};

fn corrupt_offset(data: Vec<u8>, actual: usize, recorded: usize) -> Vec<u8> {
    let text = String::from_utf8(data).unwrap();
    text.replace(
        &format!("{actual:010} 00000 n"),
        &format!("{recorded:010} 00000 n"),
    )
    .into_bytes()
}

#[test]
fn normal_files_do_not_scan_or_warn() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "42");
    // A malformed, unrequested object must not affect the normal lazy path.
    pdf.object(2, 0, "[broken");
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
    assert_eq!(
        *resolver.resolve_pdf(reference(1, 0)).unwrap(),
        PdfObject::from(42)
    );
    assert!(resolver.recovery_warnings().is_empty());
}

#[test]
fn recovers_both_directions_and_warns_once_even_without_cache() {
    for delta in [-2isize, 2] {
        let mut pdf = PdfFixture::new();
        let offset = pdf.object(1, 0, "42");
        let recorded = offset.checked_add_signed(delta).unwrap();
        let data = corrupt_offset(pdf.finish(""), offset, recorded);
        let mut strict = ObjectResolver::open(&data).unwrap();
        assert!(strict.resolve(reference(1, 0)).is_err());
        let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
        resolver.set_cache_capacity(0);
        for _ in 0..2 {
            assert_eq!(
                *resolver.resolve(reference(1, 0)).unwrap(),
                PdfObject::from(42)
            );
        }
        assert_eq!(
            resolver.recovery_warnings(),
            &[RecoveryWarning::RecoveredOffset {
                object: reference(1, 0).target(),
                recorded: ByteOffset::new(recorded as u64),
                actual: ByteOffset::new(offset as u64),
                method: RecoveryMethod::Nearby
            }]
        );
    }
}

#[test]
fn full_scan_uses_latest_duplicate_and_keeps_valid_original_entries() {
    let mut pdf = PdfFixture::new();
    let old = pdf.object(1, 0, "10");
    pdf.object(2, 0, "20");
    pdf.object(1, 0, "30");
    let good = pdf.finish("");
    let mut resolver = ObjectResolver::open_recovering(&good).unwrap();
    // The original xref parser keeps the first entry, which is still valid.
    assert_eq!(
        *resolver.resolve(reference(1, 0)).unwrap(),
        PdfObject::from(10)
    );
    let data = corrupt_offset(good, old, 999999);
    let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
    assert_eq!(
        *resolver.resolve(reference(1, 0)).unwrap(),
        PdfObject::from(30)
    );
    assert_eq!(
        *resolver.resolve(reference(2, 0)).unwrap(),
        PdfObject::from(20)
    );
    assert!(matches!(
        resolver.recovery_warnings(),
        [RecoveryWarning::RecoveredOffset {
            method: RecoveryMethod::FullScan,
            ..
        }]
    ));
}

#[test]
fn full_scan_ignores_fake_headers_in_strings_comments_and_streams() {
    let mut pdf = PdfFixture::new();
    let offset = pdf.object(1, 0, "42");
    pdf.object(2, 0, "(1 0 obj 999 endobj)");
    pdf.data.extend_from_slice(b"% 1 0 obj 888 endobj\n");
    let fake = "1 0 obj 777 endobj";
    pdf.object(
        3,
        0,
        &format!("<< /Length {} >>\nstream\n{fake}\nendstream", fake.len()),
    );
    let data = corrupt_offset(pdf.finish(""), offset, 999999);
    let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
    assert_eq!(
        *resolver.resolve(reference(1, 0)).unwrap(),
        PdfObject::from(42)
    );
}

#[test]
fn nearby_rejects_fake_header_inside_stream_payload() {
    let mut pdf = PdfFixture::new();
    let offset = pdf.object(1, 0, "42");
    let fake = "1 0 obj 777 endobj";
    pdf.object(
        2,
        0,
        &format!("<< /Length {} >>\nstream\n{fake}\nendstream", fake.len()),
    );
    let position = pdf
        .data
        .windows(fake.len())
        .position(|bytes| bytes == fake.as_bytes())
        .unwrap();
    let data = corrupt_offset(pdf.finish(""), offset, position + 1);
    let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
    assert_eq!(
        *resolver.resolve(reference(1, 0)).unwrap(),
        PdfObject::from(42)
    );
}

#[test]
fn recovers_broken_eof_and_startxref_preserving_free_and_generation_rules() {
    for damaged in ["startxref", "%%EOF"] {
        let mut pdf = PdfFixture::new();
        pdf.object(1, 0, "42");
        pdf.object(2, 1, "20");
        let offset = pdf.object(3, 0, "30");
        // Convert the existing third row to free so reconstructed objects cannot resurrect it.
        let text = String::from_utf8(pdf.finish(""))
            .unwrap()
            .replace(&format!("{offset:010} 00000 n"), "0000000000 00001 f")
            .replace(damaged, "broken");
        let mut resolver = ObjectResolver::open_recovering(text.as_bytes()).unwrap();
        assert_eq!(
            *resolver.resolve(reference(1, 0)).unwrap(),
            PdfObject::from(42)
        );
        assert_eq!(*resolver.resolve(reference(3, 0)).unwrap(), PdfObject::Null);
        assert!(matches!(
            resolver.resolve(reference(2, 0)),
            Err(ResolveError::GenerationMismatch { .. })
        ));
        assert_eq!(
            resolver.recovery_warnings(),
            &[RecoveryWarning::RebuiltXRef]
        );
    }
}

#[test]
fn reconstructs_when_xref_is_broken_and_preserves_prefix_origin() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "42");
    let data = String::from_utf8(pdf.finish(""))
        .unwrap()
        .replace("xref\n1 1", "broken\n1 1");
    let data = format!("prefix{data}");
    let mut resolver = ObjectResolver::open_recovering(data.as_bytes()).unwrap();
    assert_eq!(
        *resolver.resolve(reference(1, 0)).unwrap(),
        PdfObject::from(42)
    );
    assert_eq!(resolver.trailer().unwrap().root(), reference(1, 0));
    assert_eq!(
        resolver.recovery_warnings(),
        &[RecoveryWarning::RebuiltXRef]
    );
}

#[test]
fn unrecoverable_inputs_return_pdf_errors() {
    assert_eq!(
        ObjectResolver::open_recovering(b"not pdf")
            .unwrap_err()
            .code(),
        PdfErrorCode::ObjectResolutionFailed
    );
    assert!(ObjectResolver::open_recovering(b"%PDF-1.7\n1 0 obj 42 endobj").is_err());
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "42");
    let data = pdf.finish("2 1\n999999 0 n\n");
    let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
    assert_eq!(
        resolver.resolve_pdf(reference(2, 0)).unwrap_err().code(),
        PdfErrorCode::ObjectResolutionFailed
    );
}

#[test]
fn repairs_eof_with_indirect_length_but_rejects_encryption() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Length 2 0 R >>\nstream\nabc\nendstream");
    pdf.object(2, 0, "3");
    let data = String::from_utf8(pdf.finish(""))
        .unwrap()
        .replace("%%EOF", "broken");
    let mut resolver = ObjectResolver::open_recovering(data.as_bytes()).unwrap();
    assert!(matches!(
        resolver.resolve(reference(1, 0)).unwrap().as_ref(),
        PdfObject::Stream(_)
    ));
    let data = b"%PDF-1.7\n1 0 obj 42 endobj\ntrailer\n<< /Size 2 /Root 1 0 R /Encrypt 2 0 R >>";
    assert!(ObjectResolver::open_recovering(data).is_err());
}

#[test]
fn broken_prev_chain_keeps_readable_free_entries() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "42");
    let offset = pdf.object(2, 0, "17");
    let data = String::from_utf8(pdf.finish(""))
        .unwrap()
        .replace(&format!("{offset:010} 00000 n"), "0000000000 00001 f")
        .replace("/Size 100", "/Size 100 /Prev 999999");
    let mut resolver = ObjectResolver::open_recovering(data.as_bytes()).unwrap();
    assert_eq!(*resolver.resolve(reference(2, 0)).unwrap(), PdfObject::Null);
}

#[test]
fn shifted_stream_with_indirect_length_can_be_recovered() {
    let mut pdf = PdfFixture::new();
    let offset = pdf.object(1, 0, "<< /Length 2 0 R >>\nstream\nabc\nendstream");
    pdf.object(2, 0, "3");
    let data = corrupt_offset(pdf.finish(""), offset, offset + 2);
    let mut resolver = ObjectResolver::open_recovering(&data).unwrap();
    assert!(matches!(
        resolver.resolve(reference(1, 0)).unwrap().as_ref(),
        PdfObject::Stream(_)
    ));
}
