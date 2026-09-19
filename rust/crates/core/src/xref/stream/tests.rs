use super::*;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::indirect_ref::IndirectRef;
use crate::object::object_id::ObjectId;
use crate::xref::entry::XRefEntry;

fn adler32(data: &[u8]) -> u32 {
    let mut s1: u32 = 1;
    let mut s2: u32 = 0;
    for &b in data {
        s1 = (s1 + u32::from(b)) % 65521;
        s2 = (s2 + s1) % 65521;
    }
    (s2 << 16) | s1
}

fn make_zlib(data: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    out.extend_from_slice(&[0x78, 0x01]); // zlib header
    out.push(0x01); // BFINAL=1, BTYPE=00 (uncompressed DEFLATE)
    let len = data.len() as u16;
    let nlen = !len;
    out.extend_from_slice(&len.to_le_bytes());
    out.extend_from_slice(&nlen.to_le_bytes());
    out.extend_from_slice(data);
    let checksum = adler32(data);
    out.extend_from_slice(&checksum.to_be_bytes());
    out
}

fn make_stream_object(
    obj_num: u64,
    gen_num: u16,
    dict_content: &str,
    stream_bytes: &[u8],
) -> Vec<u8> {
    let mut out = Vec::new();
    let header = format!(
        "{obj_num} {gen_num} obj\n<< /Length {} {dict_content} >>\nstream\n",
        stream_bytes.len()
    );
    out.extend_from_slice(header.as_bytes());
    out.extend_from_slice(stream_bytes);
    out.extend_from_slice(b"\nendstream\nendobj\n");
    out
}

#[test]
fn parse_standard_flate_xref_stream() {
    // TC-01: /Filter /FlateDecode + /W [1 2 1]
    // 3 entries: obj 0, obj 1, obj 2 (record_size = 4, total 12 bytes)
    let raw_entries = [
        0x00, 0x00, 0x00, 0xff, // obj 0: free, next=0, gen=255
        0x01, 0x01, 0x00, 0x00, // obj 1: in-use, offset=256, gen=0
        0x01, 0x02, 0x00, 0x01, // obj 2: in-use, offset=512, gen=1
    ];
    let compressed = make_zlib(&raw_entries);
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 3 /W [1 2 1] /Filter /FlateDecode /Root 1 0 R",
        &compressed,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(parsed.table().len(), 2);

    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(256),
            generation: GenerationNumber::new(0),
        })
    );

    let obj2 = ObjectNumber::new(2).unwrap();
    assert_eq!(
        parsed.table().get(obj2),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(512),
            generation: GenerationNumber::new(1),
        })
    );

    let trailer = parsed.trailer().expect("trailer should exist");
    assert_eq!(trailer.size(), 3);
    assert_eq!(
        trailer.root(),
        IndirectRef::new(ObjectId::new(
            ObjectNumber::new(1).unwrap(),
            GenerationNumber::new(0),
        ))
    );
}

#[test]
fn parse_uncompressed_xref_stream() {
    // TC-02: /Filter なしの生バイナリストリーム
    let raw_entries = [
        0x00, 0x00, 0x00, 0xff, // obj 0: free
        0x01, 0x00, 0x64, 0x00, // obj 1: in-use, offset=100, gen=0
    ];
    let pdf = make_stream_object(
        5,
        0,
        "/Type /XRef /Size 2 /W [1 2 1] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(parsed.table().len(), 1);
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(100),
            generation: GenerationNumber::new(0),
        })
    );
}

#[test]
fn parse_xref_stream_with_png_predictor() {
    // TC-03: PNG Up (predictor 12) + Columns 4
    // 2 entries (each 4 bytes).
    // Row 1 (obj 0): tag 0 (None), bytes: [0, 0, 0, 0]
    // Row 2 (obj 1): tag 2 (Up), diff from row 1: [1, 1, 0, 0] -> decoded: [1, 1, 0, 0] (offset 256)
    let png_rows = [
        0x00, 0x00, 0x00, 0x00, 0x00, // tag None: [0, 0, 0, 0]
        0x02, 0x01, 0x01, 0x00, 0x00, // tag Up: [0,0,0,0] + [1,1,0,0] = [1, 1, 0, 0]
    ];
    let compressed = make_zlib(&png_rows);
    let dict_content = "/Type /XRef /Size 2 /W [1 2 1] /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 4 >> /Root 1 0 R";
    let pdf = make_stream_object(10, 0, dict_content, &compressed);

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(parsed.table().len(), 1);
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(256),
            generation: GenerationNumber::new(0),
        })
    );
}

#[test]
fn parse_xref_stream_with_type2_entries() {
    // TC-04: type 2 (InObjectStream)
    let raw_entries = [
        0x02, 0x00, 0x0a, 0x00, // obj 0: type 2 (obj 0 skips)
        0x02, 0x00, 0x0a, 0x03, // obj 1: stream_object=10, index=3
        0x02, 0x00, 0x0a, 0x04, // obj 2: stream_object=10, index=4
    ];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 3 /W [1 2 1] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InObjectStream {
            stream_object: ObjectNumber::new(10).unwrap(),
            index_in_stream: 3,
        })
    );
    let obj2 = ObjectNumber::new(2).unwrap();
    assert_eq!(
        parsed.table().get(obj2),
        Some(&XRefEntry::InObjectStream {
            stream_object: ObjectNumber::new(10).unwrap(),
            index_in_stream: 4,
        })
    );
}

#[test]
fn parse_xref_stream_with_type0_free_entries() {
    // TC-05: obj 2 に type 0 (Free)
    let raw_entries = [
        0x01, 0x00, 0x64, 0x00, 0x00, // obj 1: in-use, offset 100
        0x00, 0x00, 0x00, 0x00, 0x01, // obj 2: free, next=0, gen=1
    ];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 3 /Index [1 2] /W [1 2 2] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let obj2 = ObjectNumber::new(2).unwrap();
    assert_eq!(
        parsed.table().get(obj2),
        Some(&XRefEntry::Free {
            next_free_object: FreeObjectNumber::new(0),
            generation: GenerationNumber::new(1),
        })
    );
}

#[test]
fn parse_xref_stream_with_w_zero_fields() {
    // TC-06: /W [0 3 0] (type=1, gen=0 が補完される)
    let raw_entries = [
        0x00, 0x01, 0x00, // obj 0: offset 256 (skips)
        0x00, 0x02, 0x00, // obj 1: offset 512
    ];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 2 /W [0 3 0] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(512),
            generation: GenerationNumber::new(0),
        })
    );
}

#[test]
fn parse_xref_stream_with_w_field2_zero() {
    // TC-07: /W [1 0 1] (offset=0 が補完される)
    let raw_entries = [
        0x01, 0x00, // obj 0: type 1, gen 0 (skips)
        0x01, 0x02, // obj 1: type 1, gen 2 -> offset 0, gen 2
    ];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 2 /W [1 0 1] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(0),
            generation: GenerationNumber::new(2),
        })
    );
}

#[test]
fn parse_xref_stream_with_w_max_widths() {
    // TC-08: /W [2 8 4] (14 bytes per record)
    let mut raw_entries = Vec::new();
    // obj 1: type 1 (2B), offset 0x12345678 (8B), gen 5 (4B)
    raw_entries.extend_from_slice(&[0x00, 0x01]);
    raw_entries.extend_from_slice(&[0x00, 0x00, 0x00, 0x00, 0x12, 0x34, 0x56, 0x78]);
    raw_entries.extend_from_slice(&[0x00, 0x00, 0x00, 0x05]);

    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 2 /Index [1 1] /W [2 8 4] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(0x1234_5678),
            generation: GenerationNumber::new(5),
        })
    );
}

#[test]
fn parse_xref_stream_with_multiple_index_ranges() {
    // TC-09: /Index [0 2 10 2]
    // 4 entries: obj 0, 1, 10, 11
    let raw_entries = [
        0x01, 0x00, 0x00, // obj 0 (skips)
        0x01, 0x00, 0x01, // obj 1 (offset 1)
        0x01, 0x00, 0x0a, // obj 10 (offset 10)
        0x01, 0x00, 0x0b, // obj 11 (offset 11)
    ];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 12 /Index [0 2 10 2] /W [1 2 0] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(parsed.table().len(), 3);
    assert!(parsed.table().get(ObjectNumber::new(1).unwrap()).is_some());
    assert!(parsed.table().get(ObjectNumber::new(10).unwrap()).is_some());
    assert!(parsed.table().get(ObjectNumber::new(11).unwrap()).is_some());
}

#[test]
fn parse_xref_stream_with_duplicate_object_number_first_wins() {
    // TC-10: 先勝ち検証（同一オブジェクト番号が複数回出現）
    let raw_entries = [
        0x01, 0x00, 0x64, // 1回目: obj 1, offset 100
        0x01, 0x00, 0xc8, // 2回目: obj 1, offset 200
    ];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 2 /Index [1 1 1 1] /W [1 2 0] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let obj1 = ObjectNumber::new(1).unwrap();
    assert_eq!(
        parsed.table().get(obj1),
        Some(&XRefEntry::InUse {
            offset: ByteOffset::new(100),
            generation: GenerationNumber::new(0),
        })
    );
}

#[test]
fn parse_xref_stream_with_size_one_only_obj0() {
    // TC-11: /Size 1 で obj 0 のみ定義されている場合
    let raw_entries = [0x00, 0x00, 0x00];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 1 /W [1 2 0] /Root 1 0 R",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert!(parsed.table().is_empty());
}

#[test]
fn parse_xref_stream_without_root() {
    // TC-12: /Root がない補助 xref ストリーム
    let raw_entries = [0x01, 0x00, 0x64];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 2 /Index [1 1] /W [1 2 0]",
        &raw_entries,
    );

    let parsed = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert!(parsed.trailer().is_none());
    assert_eq!(parsed.table().len(), 1);
}

#[test]
fn reject_invalid_object_or_type() {
    // TC-13: ストリームでないオブジェクト、または /Type が /XRef でない
    let not_a_stream = b"10 0 obj\n<< /Type /XRef >>\nendobj\n";
    let err = ParsedXRefStream::parse(not_a_stream, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::NotAnXRefStream);

    let wrong_type = make_stream_object(10, 0, "/Type /Page /Size 1 /W [1 1 1]", b"abc");
    let err2 = ParsedXRefStream::parse(&wrong_type, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err2.kind, XRefErrorKind::NotAnXRefStream);
}

#[test]
fn reject_invalid_size() {
    // TC-14: /Size 欠落、または負の整数
    let missing_size = make_stream_object(10, 0, "/Type /XRef /W [1 1 1]", b"abc");
    let err = ParsedXRefStream::parse(&missing_size, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        XRefErrorKind::MissingRequiredKey {
            key: XRefStreamKey::Size
        }
    );

    let negative_size = make_stream_object(10, 0, "/Type /XRef /Size -1 /W [1 1 1]", b"abc");
    let err2 = ParsedXRefStream::parse(&negative_size, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err2.kind,
        XRefErrorKind::NegativeValue {
            key: XRefStreamKey::Size
        }
    );
}

#[test]
fn reject_invalid_w_array() {
    // TC-15: /W の要素数が不正、または上限超過、または合計 0
    let w_len2 = make_stream_object(10, 0, "/Type /XRef /Size 1 /W [1 1]", b"ab");
    let err = ParsedXRefStream::parse(&w_len2, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::InvalidWArray);

    let w_all_zero = make_stream_object(10, 0, "/Type /XRef /Size 1 /W [0 0 0]", b"");
    let err2 = ParsedXRefStream::parse(&w_all_zero, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err2.kind, XRefErrorKind::InvalidWArray);

    let w_overflow = make_stream_object(10, 0, "/Type /XRef /Size 1 /W [3 1 1]", b"abc");
    let err3 = ParsedXRefStream::parse(&w_overflow, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err3.kind, XRefErrorKind::InvalidWArray);
}

#[test]
fn reject_invalid_index_array() {
    // TC-16: 要素数が奇数の /Index
    let odd_index = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 1 /Index [0 1 2] /W [1 1 1]",
        b"abc",
    );
    let err = ParsedXRefStream::parse(&odd_index, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::InvalidIndexArray);
}

#[test]
fn reject_unsupported_filter() {
    // TC-17: 未対応のフィルタ
    let unsupported = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 1 /W [1 1 1] /Filter /ASCIIHexDecode",
        b"abc",
    );
    let err = ParsedXRefStream::parse(&unsupported, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::UnsupportedFilter);
}

#[test]
fn reject_invalid_filter_type() {
    // /Filter が Name 以外（配列など）の場合は InvalidKeyType
    let array_filter = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 1 /W [1 1 1] /Filter [/FlateDecode]",
        b"abc",
    );
    let err = ParsedXRefStream::parse(&array_filter, ByteOffset::new(0)).unwrap_err();
    assert!(matches!(
        err.kind,
        XRefErrorKind::InvalidKeyType {
            key: XRefStreamKey::Filter,
            ..
        }
    ));
}

#[test]
fn reject_corrupted_stream_data() {
    // TC-18: 壊れた zlib データ
    let corrupted = [0x78, 0x01, 0xff, 0xff, 0xff];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 1 /W [1 1 1] /Filter /FlateDecode",
        &corrupted,
    );
    let err = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::StreamDecodeFailed);
}

#[test]
fn reject_data_length_mismatch() {
    // TC-19: 展開データ長とエントリ総数×レコード長が合わない
    let raw = [0x01, 0x00, 0x00]; // 1 entry (3 bytes) but /Size 2 expects 6 bytes
    let pdf = make_stream_object(10, 0, "/Type /XRef /Size 2 /W [1 1 1]", &raw);
    let err = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        XRefErrorKind::DataLengthMismatch {
            expected: 6,
            actual: 3,
        }
    );
}

#[test]
fn reject_invalid_entry_type() {
    // TC-20: 未知の種別 (3)
    let raw = [0x03, 0x00, 0x00]; // type 3
    let pdf = make_stream_object(10, 0, "/Type /XRef /Size 1 /W [1 1 1]", &raw);
    let err = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::InvalidEntryType { actual: 3 });
}

#[test]
fn reject_type2_with_zero_stream_object() {
    // TC-21: type 2 で親ストリームオブジェクト番号が 0
    let raw = [0x02, 0x00, 0x00];
    let pdf = make_stream_object(10, 0, "/Type /XRef /Size 1 /W [1 1 1]", &raw);
    let err = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, XRefErrorKind::InvalidObjectNumber);
}

#[test]
fn reject_generation_out_of_range() {
    // TC-22: 世代番号が 65535 を超える（3バイト幅で 65536 = 0x010000）
    let raw = [0x01, 0x00, 0x01, 0x00, 0x00]; // type 1, offset 0, gen 65536
    let pdf = make_stream_object(10, 0, "/Type /XRef /Size 1 /W [1 1 3]", &raw);
    let err = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        XRefErrorKind::GenerationOutOfRange { value: 65536 }
    );
}

#[test]
fn reject_invalid_decode_parms_type() {
    // TC-23: /DecodeParms が辞書以外
    let raw = [0x00, 0x00, 0x00];
    let pdf = make_stream_object(
        10,
        0,
        "/Type /XRef /Size 1 /W [1 1 1] /DecodeParms 123",
        &raw,
    );
    let err = ParsedXRefStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert!(matches!(
        err.kind,
        XRefErrorKind::InvalidKeyType {
            key: XRefStreamKey::DecodeParms,
            ..
        }
    ));
}
