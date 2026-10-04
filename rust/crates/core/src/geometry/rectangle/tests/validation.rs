use super::*;

#[test]
fn normalizes_every_diagonal_order_including_negative_coordinates() {
    for input in [
        b"[-10 -20 612 792]".as_slice(),
        b"[612 792 -10 -20]",
        b"[-10 792 612 -20]",
        b"[612 -20 -10 792]",
    ] {
        let rectangle = parse(input).unwrap();
        assert_eq!((rectangle.min_x(), rectangle.min_y()), (-10.0, -20.0));
        assert_eq!((rectangle.max_x(), rectangle.max_y()), (612.0, 792.0));
        assert_eq!((rectangle.width(), rectangle.height()), (622.0, 812.0));
    }
}

#[test]
fn accepts_mixed_numbers_and_zero_area() {
    let rectangle = parse(b"[100.5 200 -10 0.25]").unwrap();
    assert_eq!((rectangle.width(), rectangle.height()), (110.5, 199.75));
    for (input, size) in [
        (b"[3 4 3 4]".as_slice(), (0.0, 0.0)),
        (b"[3 4 3 8]", (0.0, 4.0)),
        (b"[3 4 8 4]", (5.0, 0.0)),
        (b"[0.0 -0.0 -0.0 0.0]", (0.0, 0.0)),
    ] {
        let rectangle = parse(input).unwrap();
        assert_eq!((rectangle.width(), rectangle.height()), size);
        assert!(!rectangle.width().is_sign_negative());
        assert!(!rectangle.height().is_sign_negative());
    }
}

#[test]
fn rejects_short_and_long_arrays() {
    for (input, actual) in [
        (b"[]".as_slice(), 0),
        (b"[0]", 1),
        (b"[0 0]", 2),
        (b"[0 0 10]", 3),
        (b"[0 0 10 20 30]", 5),
    ] {
        assert_eq!(parse(input), Err(RectangleError::InvalidLength { actual }));
    }
}

#[test]
fn reports_wrong_element_kind_and_index_including_unresolved_reference() {
    for (input, index, actual) in [
        (b"[null 0 1 2]".as_slice(), 0, ObjectKind::Null),
        (b"[0 true 1 2]", 1, ObjectKind::Boolean),
        (b"[0 0 (1) 2]", 2, ObjectKind::String),
        (b"[0 0 1 /Two]", 3, ObjectKind::Name),
        (b"[0 [] 1 2]", 1, ObjectKind::Array),
        (b"[0 0 <<>> 2]", 2, ObjectKind::Dictionary),
        (b"[0 0 10 0 R 20]", 2, ObjectKind::Reference),
    ] {
        assert_eq!(
            parse(input),
            Err(RectangleError::InvalidElement { index, actual })
        );
    }
}

#[test]
fn rejects_non_finite_values_on_every_coordinate() {
    // PdfReal permits these values, though PDF lexical syntax cannot express NaN / infinity.
    for value in [f64::NAN, f64::INFINITY, f64::NEG_INFINITY] {
        for index in 0..4 {
            let mut values = vec![PdfObject::from(0.0); 4];
            values[index] = PdfObject::from(value);
            assert_eq!(
                Rectangle::try_from(&PdfArray::from(values)),
                Err(RectangleError::NonFiniteCoordinate { index })
            );
        }
    }
}

#[test]
fn rejects_extent_overflow_but_accepts_finite_extremes() {
    for values in [
        vec![-f64::MAX, 0.0, f64::MAX, 1.0],
        vec![0.0, -f64::MAX, 1.0, f64::MAX],
    ] {
        let array = PdfArray::from(values.into_iter().map(PdfObject::from).collect::<Vec<_>>());
        assert_eq!(
            Rectangle::try_from(&array),
            Err(RectangleError::NonFiniteExtent)
        );
    }
    let rectangle = parse(b"[-9223372036854775808 0 9223372036854775807 1]").unwrap();
    assert!(rectangle.width().is_finite());
    assert!(rectangle.width() > 0.0);
}
