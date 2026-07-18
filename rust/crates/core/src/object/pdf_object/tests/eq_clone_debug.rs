use super::super::*;
use super::make_ref;

#[test]
fn same_variant_same_value_is_equal() {
    // 同一バリアント・同値は == で等価になることを確認する
    assert_eq!(PdfObject::Integer(1), PdfObject::Integer(1));
    assert_eq!(PdfObject::Boolean(false), PdfObject::Boolean(false));
    assert_eq!(PdfObject::Null, PdfObject::Null);
}

#[test]
fn different_variants_are_not_equal() {
    // 異なるバリアント間は数値的同値でも != で非等価になることを確認する
    assert_ne!(PdfObject::Integer(1), PdfObject::Real(1.0));
    assert_ne!(PdfObject::Boolean(false), PdfObject::Null);
}

#[test]
fn all_distinct_variants_are_mutually_not_equal() {
    // 全 10 バリアントを総当たりで比較し、同一インデックスのみ等価・他は非等価であることを確認する
    // （NaN は等価判定が崩れるため代表値には含めない。String/Name/Array/Dictionary/Stream は有限値・
    // Reference は Eq なので NaN 制約に抵触しない）
    let variants = [
        PdfObject::Null,
        PdfObject::Boolean(false),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::String(b"abc".to_vec()),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::Array(vec![PdfObject::Integer(1)]),
        PdfObject::Dictionary(PdfDictionary::new()),
        PdfObject::Stream(PdfStream::new(PdfDictionary::new(), b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for (i, a) in variants.iter().enumerate() {
        for (j, b) in variants.iter().enumerate() {
            if i == j {
                assert_eq!(a, b);
            } else {
                assert_ne!(a, b);
            }
        }
    }
}

#[test]
fn integer_preserves_i64_boundaries() {
    // Integer(i64::MIN) / Integer(i64::MAX) を as_integer() でそのまま取り出せることを確認する
    for n in [i64::MIN, i64::MAX] {
        assert_eq!(PdfObject::Integer(n).as_integer(), Some(n));
    }
}

#[test]
fn positive_and_negative_zero_are_equal() {
    // Real(0.0) と Real(-0.0) は IEEE 754 準拠で == 等価になることを確認する
    assert_eq!(PdfObject::Real(0.0), PdfObject::Real(-0.0));
}

#[test]
fn nan_is_not_equal_to_itself() {
    // Real(NaN) 同士は IEEE 754 準拠で != 非等価（NaN != NaN）になることを確認する
    assert_ne!(PdfObject::Real(f64::NAN), PdfObject::Real(f64::NAN));
}

#[test]
fn real_preserves_infinities() {
    // Real(±INFINITY) を as_real() でそのまま取り出せること（doc の「Inf 可」を裏付け）を確認する
    for r in [f64::INFINITY, f64::NEG_INFINITY] {
        assert_eq!(PdfObject::Real(r).as_real(), Some(r));
    }
}

#[test]
fn clone_preserves_value_and_keeps_original_usable() {
    // NaN 以外（Integer(7)）は Clone で複製でき、複製が元と == かつ元も使用可能なことを確認する
    let original = PdfObject::Integer(7);
    let cloned = original.clone();
    assert_eq!(cloned, original);
    assert_eq!(original.as_integer(), Some(7));
}

#[test]
fn clone_preserves_nan_real() {
    // Real(NaN) の clone 保持は == では検証できないため as_real().is_some_and(is_nan) で確認する。
    // 複製後も original が引き続き使用可能であることも併せて確認する
    let original = PdfObject::Real(f64::NAN);
    let cloned = original.clone();
    assert!(cloned.as_real().is_some_and(f64::is_nan));
    assert!(original.as_real().is_some_and(f64::is_nan));
}

#[test]
fn debug_format_contains_variant_name() {
    // Debug 出力が各バリアント名を含むことを確認する
    assert!(format!("{:?}", PdfObject::Null).contains("Null"));
    assert!(format!("{:?}", PdfObject::Boolean(true)).contains("Boolean"));
    assert!(format!("{:?}", PdfObject::Integer(0)).contains("Integer"));
    assert!(format!("{:?}", PdfObject::Real(0.0)).contains("Real"));
}
