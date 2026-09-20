use super::*;
use crate::object::name::PdfName;

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

fn make_objstm_custom(type_part: &str, dict_content: &str, stream_bytes: &[u8]) -> Vec<u8> {
    let mut out = Vec::new();
    let header = format!(
        "10 0 obj\n<< /Length {} {type_part} {dict_content} >>\nstream\n",
        stream_bytes.len()
    );
    out.extend_from_slice(header.as_bytes());
    out.extend_from_slice(stream_bytes);
    out.extend_from_slice(b"\nendstream\nendobj\n");
    out
}

fn make_objstm(dict_content: &str, stream_bytes: &[u8]) -> Vec<u8> {
    make_objstm_custom("/Type /ObjStm", dict_content, stream_bytes)
}

#[test]
fn parse_uncompressed_object_stream() {
    // オブジェクト 3 個:
    // obj 11: 42 (Integer)
    // obj 12: [1 2 3] (Array)
    // obj 13: << /Key /Val >> (Dictionary)
    //
    // ヘッダ: "11 0 12 3 13 11 " (16 bytes)
    // オフセット 0: "42 "
    // オフセット 3: "[1 2 3] "
    // オフセット 11: "<< /Key /Val >>"
    let header = b"11 0 12 3 13 11 ";
    let body = b"42 [1 2 3] << /Key /Val >>";
    let first = header.len();

    let mut stream_data = Vec::new();
    stream_data.extend_from_slice(header);
    stream_data.extend_from_slice(body);

    let dict = format!("/N 3 /First {first}");
    let pdf = make_objstm(&dict, &stream_data);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(objstm.n(), 3);
    assert_eq!(objstm.first(), first);
    assert_eq!(objstm.extends(), None);

    // インデックス 0 の抽出
    let (id0, obj0) = objstm.get_object(0).unwrap();
    assert_eq!(id0.object_number().value(), 11);
    assert_eq!(id0.generation_number().value(), 0);
    assert_eq!(obj0, PdfObject::Integer(42));

    // インデックス 1 の抽出
    let (id1, obj1) = objstm.get_object(1).unwrap();
    assert_eq!(id1.object_number().value(), 12);
    assert_eq!(id1.generation_number().value(), 0);
    match obj1 {
        PdfObject::Array(arr) => assert_eq!(arr.len(), 3),
        other => panic!("expected Array, got {other:?}"),
    }

    // インデックス 2 の抽出
    let (id2, obj2) = objstm.get_object(2).unwrap();
    assert_eq!(id2.object_number().value(), 13);
    assert_eq!(id2.generation_number().value(), 0);
    match obj2 {
        PdfObject::Dictionary(d) => {
            assert_eq!(
                d.get(&b"Key"[..]),
                Some(&PdfObject::Name(PdfName::new(b"Val")))
            );
        }
        other => panic!("expected Dictionary, got {other:?}"),
    }

    // get_object_by_number
    let found = objstm
        .get_object_by_number(ObjectNumber::new(12).unwrap())
        .unwrap();
    assert!(found.is_some());
    let not_found = objstm
        .get_object_by_number(ObjectNumber::new(99).unwrap())
        .unwrap();
    assert!(not_found.is_none());

    // 範囲外インデックス
    let err = objstm.get_object(3).unwrap_err();
    assert_eq!(
        err.kind,
        ObjectStreamErrorKind::IndexOutOfBounds { index: 3, count: 3 }
    );
}

#[test]
fn parse_flatedecode_object_stream() {
    let header = b"20 0 21 5 ";
    let body = b"true (hello)";
    let first = header.len();

    let mut raw_data = Vec::new();
    raw_data.extend_from_slice(header);
    raw_data.extend_from_slice(body);

    let compressed = make_zlib(&raw_data);
    let dict = format!("/N 2 /First {first} /Filter /FlateDecode");
    let pdf = make_objstm(&dict, &compressed);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(objstm.n(), 2);
    assert_eq!(objstm.first(), first);

    let (id0, obj0) = objstm.get_object(0).unwrap();
    assert_eq!(id0.object_number().value(), 20);
    assert_eq!(obj0, PdfObject::Boolean(true));

    let (id1, obj1) = objstm.get_object(1).unwrap();
    assert_eq!(id1.object_number().value(), 21);
    match obj1 {
        PdfObject::String(s) => assert_eq!(s.as_bytes(), b"hello"),
        other => panic!("expected String, got {other:?}"),
    }
}

#[test]
fn parse_flatedecode_with_predictor() {
    // PNG predictor (Predictor 12, tag 0 = None):
    // row 0: tag 0 (None), 10 bytes -> "30 0 31 4 " (first=10)
    // row 1: tag 0 (None), 10 bytes -> "100 200   "
    // Columns = 10, Predictor = 12
    let mut row_data = Vec::new();
    row_data.push(0x00); // PNG filter tag = None
    row_data.extend_from_slice(b"30 0 31 4 "); // 10 bytes
    row_data.push(0x00); // PNG filter tag = None
    row_data.extend_from_slice(b"100 200   "); // 10 bytes

    let compressed = make_zlib(&row_data);
    let dict = "/N 2 /First 10 /Filter /FlateDecode /DecodeParms << /Predictor 12 /Columns 10 >>";
    let pdf = make_objstm(dict, &compressed);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(objstm.n(), 2);
    assert_eq!(objstm.first(), 10);

    let (id0, obj0) = objstm.get_object(0).unwrap();
    assert_eq!(id0.object_number().value(), 30);
    assert_eq!(obj0, PdfObject::Integer(100));

    let (id1, obj1) = objstm.get_object(1).unwrap();
    assert_eq!(id1.object_number().value(), 31);
    assert_eq!(obj1, PdfObject::Integer(200));
}

#[test]
fn parse_with_extends() {
    let header = b"50 0 ";
    let body = b"/A";
    let first = header.len();

    let mut raw_data = Vec::new();
    raw_data.extend_from_slice(header);
    raw_data.extend_from_slice(body);

    let dict = format!("/N 1 /First {first} /Extends 5 0 R");
    let pdf = make_objstm(&dict, &raw_data);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(
        objstm.extends(),
        Some(ObjectId::new(
            ObjectNumber::new(5).unwrap(),
            GenerationNumber::new(0)
        ))
    );
}

#[test]
fn from_stream_constructor() {
    let mut dict = PdfDictionary::new();
    dict.insert(
        PdfName::new(b"Type"),
        PdfObject::Name(PdfName::new(b"ObjStm")),
    );
    dict.insert(PdfName::new(b"N"), PdfObject::Integer(1));
    dict.insert(PdfName::new(b"First"), PdfObject::Integer(5));

    let stream = PdfStream::new(dict, b"10 0 null".to_vec());
    let objstm = ObjectStream::from_stream(stream, ByteOffset::new(100)).unwrap();
    assert_eq!(objstm.n(), 1);
    assert_eq!(objstm.first(), 5);

    let (id, obj) = objstm.get_object(0).unwrap();
    assert_eq!(id.object_number().value(), 10);
    assert_eq!(obj, PdfObject::Null);
}

#[test]
fn error_not_an_object_stream() {
    // /Type /Catalog (ObjStm ではない)
    let pdf = make_objstm_custom("/Type /Catalog", "/N 1 /First 5", b"10 0 1");
    let err = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::NotAnObjectStream);

    // ストリームオブジェクトではない (単なる辞書)
    let not_stream = b"10 0 obj\n<< /Type /ObjStm /N 1 /First 5 >>\nendobj\n";
    let err2 = ObjectStream::parse(not_stream, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err2.kind, ObjectStreamErrorKind::NotAnObjectStream);
}

#[test]
fn error_missing_required_keys() {
    // /N 欠損
    let pdf_no_n = make_objstm("/First 5", b"10 0 1");
    let err = ObjectStream::parse(&pdf_no_n, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        ObjectStreamErrorKind::MissingRequiredKey(ObjectStreamKey::N)
    );

    // /First 欠損
    let pdf_no_first = make_objstm("/N 1", b"10 0 1");
    let err = ObjectStream::parse(&pdf_no_first, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        ObjectStreamErrorKind::MissingRequiredKey(ObjectStreamKey::First)
    );
}

#[test]
fn error_invalid_n_or_first() {
    // /N が 0
    let pdf_n_zero = make_objstm("/N 0 /First 5", b"10 0 1");
    let err = ObjectStream::parse(&pdf_n_zero, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::InvalidN(0));

    // /First が負値
    let pdf_first_neg = make_objstm("/N 1 /First -5", b"10 0 1");
    let err = ObjectStream::parse(&pdf_first_neg, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::InvalidFirst(-5));
}

#[test]
fn error_first_out_of_bounds() {
    let data = b"10 0 1"; // len = 6
    let pdf = make_objstm("/N 1 /First 100", data);
    let err = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        ObjectStreamErrorKind::FirstOutOfBounds {
            first: 100,
            data_len: 6,
        }
    );
}

#[test]
fn error_pair_count_mismatch() {
    // /N = 2 なのにペアが 1 つしかない
    let data = b"10 0 1";
    let pdf = make_objstm("/N 2 /First 5", data);
    let err = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(
        err.kind,
        ObjectStreamErrorKind::PairCountMismatch {
            expected: 2,
            actual: 1,
        }
    );
}

#[test]
fn error_stream_in_object_stream() {
    // 1. stream キーワードが直接現れる場合
    let header = b"10 0 ";
    let body = b"stream\nfoo\nendstream";
    let mut data = Vec::new();
    data.extend_from_slice(header);
    data.extend_from_slice(body);

    let pdf = make_objstm("/N 1 /First 5", &data);
    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let err = objstm.get_object(0).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::StreamInObjectStream);

    // 2. 辞書に続いて stream キーワードが現れる場合 (ISO 32000-1 §7.5.7, TC-18)
    let header2 = b"10 0 ";
    let body2 = b"<< /Length 5 >> stream\n12345\nendstream";
    let mut data2 = Vec::new();
    data2.extend_from_slice(header2);
    data2.extend_from_slice(body2);

    let pdf2 = make_objstm("/N 1 /First 5", &data2);
    let objstm2 = ObjectStream::parse(&pdf2, ByteOffset::new(0)).unwrap();
    let err2 = objstm2.get_object(0).unwrap_err();
    assert_eq!(err2.kind, ObjectStreamErrorKind::StreamInObjectStream);
}

#[test]
fn error_unsupported_filter() {
    let pdf = make_objstm("/N 1 /First 5 /Filter /ASCIIHexDecode", b"10 0 1");
    let err = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::UnsupportedFilter);
}

#[test]
fn header_with_comments_and_whitespace() {
    let header = b"11\t0\n% comment\n12  8 ";
    let body = b"(hello) true";
    let first = header.len();

    let mut stream_data = Vec::new();
    stream_data.extend_from_slice(header);
    stream_data.extend_from_slice(body);

    let dict = format!("/N 2 /First {first}");
    let pdf = make_objstm(&dict, &stream_data);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(objstm.n(), 2);
    let (id0, obj0) = objstm.get_object(0).unwrap();
    assert_eq!(id0.object_number().value(), 11);
    match obj0 {
        PdfObject::String(s) => assert_eq!(s.as_bytes(), b"hello"),
        other => panic!("expected String, got {other:?}"),
    }
    let (id1, obj1) = objstm.get_object(1).unwrap();
    assert_eq!(id1.object_number().value(), 12);
    assert_eq!(obj1, PdfObject::Boolean(true));
}

#[test]
fn single_object_boundary_n_one() {
    let header = b"10 0 ";
    let body = b"42";
    let first = header.len();

    let mut stream_data = Vec::new();
    stream_data.extend_from_slice(header);
    stream_data.extend_from_slice(body);

    let dict = format!("/N 1 /First {first}");
    let pdf = make_objstm(&dict, &stream_data);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    assert_eq!(objstm.n(), 1);
    let (id, obj) = objstm.get_object(0).unwrap();
    assert_eq!(id.object_number().value(), 10);
    assert_eq!(obj, PdfObject::Integer(42));
    assert!(objstm.get_object(1).is_err());
}

#[test]
fn large_object_number_and_offset() {
    let header = b"999999 50 ";
    let mut body = vec![b' '; 50];
    body.extend_from_slice(b"123");
    let first = header.len();

    let mut stream_data = Vec::new();
    stream_data.extend_from_slice(header);
    stream_data.extend_from_slice(&body);

    let dict = format!("/N 1 /First {first}");
    let pdf = make_objstm(&dict, &stream_data);

    let objstm = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap();
    let (id, obj) = objstm.get_object(0).unwrap();
    assert_eq!(id.object_number().value(), 999999);
    assert_eq!(obj, PdfObject::Integer(123));
}

#[test]
fn error_zero_object_number_in_header() {
    let header = b"0 0 ";
    let body = b"42";
    let first = header.len();

    let mut stream_data = Vec::new();
    stream_data.extend_from_slice(header);
    stream_data.extend_from_slice(body);

    let dict = format!("/N 1 /First {first}");
    let pdf = make_objstm(&dict, &stream_data);

    let err = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::InvalidObjectNumber(0));
}

#[test]
fn error_corrupted_flatedecode_stream() {
    let corrupted = vec![0x78, 0x9c, 0xff, 0xff];
    let pdf = make_objstm("/N 1 /First 5 /Filter /FlateDecode", &corrupted);
    let err = ObjectStream::parse(&pdf, ByteOffset::new(0)).unwrap_err();
    assert_eq!(err.kind, ObjectStreamErrorKind::StreamDecodeFailed);
}
