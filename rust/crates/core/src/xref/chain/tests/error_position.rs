use super::*;

#[test]
fn delegated_file_error_keeps_original_kind_and_position() {
    let data = b"%PDF-1.7\nstartxref\ninvalid\n%%EOF\n";
    let expected = StartXref::parse(data).unwrap_err();
    let actual = parse(data).unwrap_err();
    assert_eq!(actual.position(), expected.position);
    assert_eq!(actual.into_kind(), XRefChainErrorKind::File(expected.kind));
}

#[test]
fn delegated_xref_error_keeps_original_kind_and_position_with_prefix() {
    let mut data = b"prefix%PDF-1.7\n".to_vec();
    let offset = ByteOffset::new(data.len() as u64);
    data.extend_from_slice(b"xref\n1 1\n12 0 x\n");
    finish(&mut data, offset.value() as usize - b"prefix".len());
    let expected = ParsedXRefTable::parse(&data, offset).unwrap_err();
    let actual = parse(&data).unwrap_err();
    assert_eq!(actual.position(), expected.position);
    assert!(actual.position().value() > offset.value());
    assert_eq!(actual.into_kind(), XRefChainErrorKind::XRef(expected.kind));
}

#[test]
fn delegated_trailer_error_keeps_original_kind_and_position() {
    let mut data = b"%PDF-1.7\n".to_vec();
    let start = data.len();
    data.extend_from_slice(b"xref\n1 1\n12 0 n\ntrailer\n<< /Size 2 >>\n");
    finish(&mut data, start);
    let table = ParsedXRefTable::parse(&data, ByteOffset::new(start as u64)).unwrap();
    let expected = ParsedTrailer::parse(&data, table.end()).unwrap_err();
    let actual = parse(&data).unwrap_err();
    assert_eq!(actual.position(), expected.position);
    assert_eq!(
        actual.into_kind(),
        XRefChainErrorKind::Trailer(expected.kind)
    );
}

#[test]
fn invalid_offset_keeps_recorded_value_and_corrected_position() {
    let data = b"prefix%PDF-1.7\n";
    let header = PdfHeader::parse(data).unwrap();
    let recorded = ByteOffset::new(1000);
    let error = XRefChain::parse_at(data, &header, recorded, 10).unwrap_err();
    assert_eq!(error.position(), ByteOffset::new(1006));
    assert_eq!(
        error.into_kind(),
        XRefChainErrorKind::InvalidOffset { recorded }
    );

    let recorded = ByteOffset::new(u64::MAX);
    let error = XRefChain::parse_at(data, &header, recorded, 10).unwrap_err();
    assert_eq!(error.position(), recorded);
    assert_eq!(
        error.into_kind(),
        XRefChainErrorKind::InvalidOffset { recorded }
    );
}
