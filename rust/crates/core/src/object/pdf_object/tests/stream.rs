use super::super::*;
use super::{make_ref, make_stream};

#[test]
fn stream_constructs_and_matches_stream_arm() {
    // Stream(PdfStream::new(...)) を構築し matches! で Stream 腕に入ることを確認する
    let obj = PdfObject::Stream(make_stream(b"data"));
    assert!(matches!(obj, PdfObject::Stream(_)));
}

#[test]
fn as_stream_returns_some_for_stream() {
    // Stream に as_stream() を呼ぶと Some(&PdfStream) を返し内容が一致する（参照返し）ことを確認する
    let stream = make_stream(b"data");
    let obj = PdfObject::Stream(stream.clone());
    assert_eq!(obj.as_stream(), Some(&stream));
}

#[test]
fn as_stream_returns_none_for_non_stream_variants() {
    // Stream 以外（Null/Boolean/Integer/Real/String/Name/Array/Dictionary/Reference）では as_stream() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::Array(vec![PdfObject::Integer(1)]),
        PdfObject::Dictionary(PdfDictionary::new()),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for obj in &variants {
        assert_eq!(obj.as_stream(), None);
    }
}

#[test]
fn as_stream_then_accessors_roundtrip() {
    // as_stream().unwrap().dictionary() / .data() で構築時の辞書・バイト列が返る（後段借用経路）ことを確認する
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("Length"), PdfObject::Integer(4));
    let obj = PdfObject::Stream(PdfStream::new(dict.clone(), b"body"));
    let stream = obj.as_stream().unwrap();
    assert_eq!(stream.dictionary(), &dict);
    assert_eq!(stream.data(), b"body");
}

#[test]
fn same_content_streams_wrapped_are_equal() {
    // 同内容の PdfStream を内包する Stream 同士は == で等価になることを確認する
    assert_eq!(
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Stream(make_stream(b"data"))
    );
}

#[test]
fn stream_and_dictionary_with_same_dictionary_are_not_equal() {
    // 同一辞書を持つ Stream（空データ）と Dictionary は異バリアントのため != で非等価になることを確認する
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("Type"), PdfObject::Integer(1));
    assert_ne!(
        PdfObject::Stream(PdfStream::new(dict.clone(), b"")),
        PdfObject::Dictionary(dict)
    );
}

#[test]
fn stream_containing_nan_is_not_equal_to_itself_content() {
    // 辞書値に Real(NaN) を含む Stream 同士は NaN != NaN が enum まで伝播し != になることを確認する
    let mut dict_a = PdfDictionary::new();
    dict_a.insert(PdfName::from("N"), PdfObject::Real(f64::NAN));
    let mut dict_b = PdfDictionary::new();
    dict_b.insert(PdfName::from("N"), PdfObject::Real(f64::NAN));
    assert_ne!(
        PdfObject::Stream(PdfStream::new(dict_a, b"data")),
        PdfObject::Stream(PdfStream::new(dict_b, b"data"))
    );
}

#[test]
fn clone_preserves_stream_and_keeps_original_usable() {
    // Stream バリアントを clone() すると複製が元と == かつ元も引き続き使用可能なことを確認する
    let original = PdfObject::Stream(make_stream(b"data"));
    let cloned = original.clone();
    assert_eq!(cloned, original);
    assert_eq!(original.as_stream().unwrap().data(), b"data");
}

#[test]
fn debug_format_contains_stream_variant_name() {
    // Debug 出力が Stream のバリアント名を含むことを確認する
    assert!(format!("{:?}", PdfObject::Stream(make_stream(b"data"))).contains("Stream"));
}
