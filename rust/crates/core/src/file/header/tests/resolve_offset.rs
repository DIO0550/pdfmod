use crate::byte_offset::ByteOffset;
use crate::file::header::PdfHeader;

fn header_with_origin(origin: usize) -> PdfHeader {
    let mut input = vec![b'x'; origin];
    input.extend_from_slice(b"%PDF-1.7\n");
    PdfHeader::parse(&input).expect("valid header")
}

#[test]
fn resolve_offset_zero_origin_returns_recorded_value() {
    // 原点 0 では記録オフセットがそのまま実位置になることを確認する
    let header = header_with_origin(0);
    assert_eq!(
        header.resolve_offset(ByteOffset::new(500)),
        Some(ByteOffset::new(500))
    );
}

#[test]
fn resolve_offset_prefixed_origin_adds_origin() {
    // 原点 37 では記録値 500 が実位置 537 になることを確認する
    let header = header_with_origin(37);
    assert_eq!(
        header.resolve_offset(ByteOffset::new(500)),
        Some(ByteOffset::new(537))
    );
}

#[test]
fn resolve_offset_zero_recorded_returns_origin() {
    // 記録値 0 がオフセット原点そのものへ補正されることを確認する
    let header = header_with_origin(0);
    assert_eq!(
        header.resolve_offset(ByteOffset::new(0)),
        Some(ByteOffset::new(0))
    );
}

#[test]
fn resolve_offset_overflow_returns_none() {
    // 原点が正のとき u64::MAX の記録値が wrap せず None になることを確認する
    let header = header_with_origin(1);
    assert_eq!(header.resolve_offset(ByteOffset::new(u64::MAX)), None);
}

#[test]
fn resolve_offset_sum_at_u64_max_returns_some() {
    // 加算結果がちょうど u64::MAX なら成功することを確認する
    let header = header_with_origin(37);
    assert_eq!(
        header.resolve_offset(ByteOffset::new(u64::MAX - 37)),
        Some(ByteOffset::new(u64::MAX))
    );
}

#[test]
fn resolve_offset_sum_one_past_u64_max_returns_none() {
    // 加算結果が u64::MAX を 1 超えると None になることを確認する
    let header = header_with_origin(37);
    assert_eq!(header.resolve_offset(ByteOffset::new(u64::MAX - 36)), None);
}
