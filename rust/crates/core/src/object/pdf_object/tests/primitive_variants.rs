use super::super::*;
use super::{make_ref, make_stream};

#[test]
fn null_constructs_and_matches_null_arm() {
    // Null を構築し match で Null 腕に入ることを確認する
    let obj = PdfObject::Null;
    assert!(matches!(obj, PdfObject::Null));
}

#[test]
fn boolean_constructs_and_matches_with_inner_value() {
    // Boolean(true) を構築し match の Boolean(b) 腕で b == true になることを確認する
    let obj = PdfObject::Boolean(true);
    match obj {
        PdfObject::Boolean(b) => assert!(b),
        _ => panic!("Boolean 腕に入らなかった"),
    }
}

#[test]
fn integer_constructs_and_matches_with_inner_value() {
    // Integer(42) を構築し match の Integer(n) 腕で n == 42 になることを確認する
    let obj = PdfObject::Integer(42);
    match obj {
        PdfObject::Integer(n) => assert_eq!(n, 42),
        _ => panic!("Integer 腕に入らなかった"),
    }
}

#[test]
fn real_constructs_and_matches_with_inner_value() {
    // Real(1.5) を構築し match の Real(r) 腕で r == 1.5 になることを確認する
    let obj = PdfObject::Real(1.5);
    match obj {
        PdfObject::Real(r) => assert_eq!(r, 1.5),
        _ => panic!("Real 腕に入らなかった"),
    }
}

#[test]
fn is_null_returns_true_for_null() {
    // Null に is_null() を呼ぶと true を返すことを確認する
    assert!(PdfObject::Null.is_null());
}

#[test]
fn as_bool_returns_some_for_boolean() {
    // Boolean(true) に as_bool() を呼ぶと Some(true) を返すことを確認する
    assert_eq!(PdfObject::Boolean(true).as_bool(), Some(true));
}

#[test]
fn as_integer_returns_some_for_integer() {
    // Integer(7) に as_integer() を呼ぶと Some(7) を返すことを確認する
    assert_eq!(PdfObject::Integer(7).as_integer(), Some(7));
}

#[test]
fn as_real_returns_some_for_real() {
    // Real(2.5) に as_real() を呼ぶと Some(2.5) を返すことを確認する
    assert_eq!(PdfObject::Real(2.5).as_real(), Some(2.5));
}

#[test]
fn is_null_returns_false_for_non_null_variants() {
    // Null 以外（Boolean/Integer/Real）では is_null() が false を返すことを確認する
    for obj in &[
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
    ] {
        assert!(!obj.is_null());
    }
}

#[test]
fn as_bool_returns_none_for_non_boolean_variants() {
    // Boolean 以外（Null/Integer/Real/Stream/Reference）では as_bool() が None を返すことを確認する
    for obj in &[
        PdfObject::Null,
        PdfObject::Integer(0),
        PdfObject::Real(0.0),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ] {
        assert_eq!(obj.as_bool(), None);
    }
}

#[test]
fn as_integer_returns_none_for_non_integer_variants() {
    // Integer 以外（Null/Boolean/Real/Stream/Reference）では as_integer() が None を返すことを確認する
    for obj in &[
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Real(0.0),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ] {
        assert_eq!(obj.as_integer(), None);
    }
}

#[test]
fn as_real_returns_none_for_non_real_variants() {
    // Real 以外（Null/Boolean/Integer/Stream/Reference）では as_real() が None を返すことを確認する
    for obj in &[
        PdfObject::Null,
        PdfObject::Boolean(true),
        PdfObject::Integer(0),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ] {
        assert_eq!(obj.as_real(), None);
    }
}
