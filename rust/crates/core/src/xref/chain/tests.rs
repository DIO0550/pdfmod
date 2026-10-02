use super::*;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;

fn text(data: &mut Vec<u8>, entries: &str, keys: &str) -> usize {
    let offset = data.len();
    data.extend_from_slice(
        format!("xref\n{entries}trailer\n<< /Size 10 /Root 1 0 R {keys} >>\n").as_bytes(),
    );
    offset
}
fn stream(data: &mut Vec<u8>, keys: &str) -> usize {
    let offset = data.len();
    data.extend_from_slice(format!("9 0 obj\n<< /Type /XRef /Size 10 /W [1 1 1] /Index [2 1] /Length 3 {keys} >>\nstream\n").as_bytes());
    data.extend_from_slice(&[2, 8, 0]);
    data.extend_from_slice(b"\nendstream\nendobj\n");
    offset
}
fn finish(data: &mut Vec<u8>, start: usize) {
    data.extend_from_slice(format!("startxref\n{start}\n%%EOF\n").as_bytes());
}
fn parse(data: &[u8]) -> Result<XRefChain, XRefChainError> {
    XRefChain::parse(data, &PdfHeader::parse(data).unwrap())
}
fn entry(chain: &XRefChain, number: u64) -> &XRefEntry {
    chain
        .table()
        .get(ObjectNumber::new(number).unwrap())
        .unwrap()
}

#[test]
fn single_and_incremental_newest_wins_including_free() {
    let mut data = b"%PDF-1.7\n".to_vec();
    let old = text(&mut data, "1 2\n11 0 n\n22 0 n\n", "/Info 7 0 R");
    finish(&mut data, old);
    assert_eq!(parse(&data).unwrap().table().len(), 2);
    let middle = text(&mut data, "2 1\n33 0 n\n", &format!("/Prev {old}"));
    let last = text(
        &mut data,
        "2 1\n0 1 f\n",
        &format!("/Prev {middle} /Root 3 0 R /Size 20"),
    );
    finish(&mut data, last);
    let chain = parse(&data).unwrap();
    assert!(matches!(entry(&chain, 1), XRefEntry::InUse { offset, .. } if offset.value() == 11));
    assert!(matches!(entry(&chain, 2), XRefEntry::Free { .. }));
    assert_eq!(chain.trailer().root().target().object_number().value(), 3);
    assert_eq!(chain.trailer().size(), 20);
    assert_eq!(chain.trailer().info(), None);
}

#[test]
fn mixed_chain_and_hybrid_precedence() {
    let mut data = b"%PDF-1.7\n".to_vec();
    let old = text(&mut data, "1 2\n11 0 n\n22 0 n\n", "");
    let middle = stream(&mut data, &format!("/Root 1 0 R /Prev {old}"));
    let supplement = stream(&mut data, "/Prev 999999");
    let newest = text(
        &mut data,
        "2 1\n0 1 f\n",
        &format!("/Prev {middle} /XRefStm {supplement}"),
    );
    finish(&mut data, newest);
    let chain = parse(&data).unwrap();
    assert_eq!(chain.table().len(), 2);
    assert!(
        matches!(entry(&chain, 2), XRefEntry::InObjectStream { stream_object, .. } if stream_object.value() == 8)
    );
    // A newer text entry must also win over an older revision's supplement.
    let last = text(&mut data, "2 1\n44 0 n\n", &format!("/Prev {newest}"));
    finish(&mut data, last);
    assert!(
        matches!(entry(&parse(&data).unwrap(), 2), XRefEntry::InUse { offset, .. } if offset.value() == 44)
    );
}

#[test]
fn prefix_origin_applies_to_entire_chain() {
    let mut pdf = b"%PDF-1.7\n".to_vec();
    let old = stream(&mut pdf, "/Root 1 0 R");
    let newest = text(&mut pdf, "1 1\n9 0 n\n", &format!("/Prev {old}"));
    finish(&mut pdf, newest);
    let mut data = b"prefix".to_vec();
    data.extend(pdf);
    assert_eq!(parse(&data).unwrap().table().len(), 2);
}

#[test]
fn detects_self_mutual_and_hybrid_cycles() {
    let mut data = b"%PDF-1.7\n".to_vec();
    let first = text(&mut data, "", "/Prev 0000000000");
    let second = text(&mut data, "", &format!("/Prev {first}"));
    let mark = data.windows(10).position(|v| v == b"0000000000").unwrap();
    data[mark..mark + 10].copy_from_slice(format!("{second:010}").as_bytes());
    finish(&mut data, second);
    assert_eq!(
        parse(&data).unwrap_err(),
        XRefChainError::Cycle(ByteOffset::new(second as u64))
    );
    let own = data.len();
    let last = text(&mut data, "", &format!("/Prev {own}"));
    finish(&mut data, last);
    assert!(matches!(parse(&data), Err(XRefChainError::Cycle(_))));
    let own = data.len();
    let last = text(&mut data, "", &format!("/XRefStm {own}"));
    finish(&mut data, last);
    assert!(matches!(parse(&data), Err(XRefChainError::Cycle(_))));
}

#[test]
fn depth_boundaries_invalid_offsets_and_missing_root() {
    let mut data = b"%PDF-1.7\n".to_vec();
    let old = text(&mut data, "", "");
    let last = text(&mut data, "", &format!("/Prev {old}"));
    let header = PdfHeader::parse(&data).unwrap();
    for limit in [0, 1] {
        assert!(matches!(
            XRefChain::parse_at(&data, &header, ByteOffset::new(last as u64), limit),
            Err(XRefChainError::TooDeep { .. })
        ));
    }
    assert!(XRefChain::parse_at(&data, &header, ByteOffset::new(last as u64), 2).is_ok());
    let last = text(&mut data, "", "/Prev 0");
    finish(&mut data, last);
    // Offset zero is followed, and the PDF header is skipped as a comment.
    assert!(parse(&data).is_ok());
    let last = text(&mut data, "", "/Prev 999999");
    finish(&mut data, last);
    assert!(matches!(
        parse(&data),
        Err(XRefChainError::InvalidOffset(_))
    ));
    let last = stream(&mut data, "");
    finish(&mut data, last);
    assert!(matches!(
        parse(&data),
        Err(XRefChainError::MissingTrailer(_))
    ));
    assert!(matches!(
        XRefChain::parse_at(&data, &header, ByteOffset::new(u64::MAX), 10),
        Err(XRefChainError::InvalidOffset(_))
    ));
}
