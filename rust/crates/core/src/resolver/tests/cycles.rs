use super::*;

#[test]
fn reports_self_two_and_three_object_cycles_without_poisoning_later_calls() {
    for count in 1..=3u64 {
        let mut pdf = PdfFixture::new();
        for number in 1..=count {
            let next = number % count + 1;
            pdf.object(number, 0, &format!("{next} 0 R"));
        }
        pdf.object(10, 0, "42");
        let data = pdf.finish("");
        let mut resolver = ObjectResolver::open(&data).unwrap();
        for _ in 0..2 {
            let error = resolver.resolve(reference(1, 0)).unwrap_err();
            let ResolveError::Cycle(path) = error else {
                panic!("cycle expected")
            };
            assert_eq!(path.len(), usize::try_from(count).unwrap() + 1);
            assert_eq!(path.first(), Some(&reference(1, 0).target()));
            assert_eq!(path.first(), path.last());
            assert_eq!(
                *resolver.resolve(reference(10, 0)).unwrap(),
                PdfObject::from(42)
            );
        }
    }
}

#[test]
fn accepts_depth_limit_and_distinguishes_excess_from_cycle() {
    for count in [100, 101] {
        let mut pdf = PdfFixture::new();
        for number in 1..count {
            pdf.object(number, 0, &format!("{} 0 R", number + 1));
        }
        pdf.object(count, 0, "true");
        let data = pdf.finish("");
        let mut resolver = ObjectResolver::open(&data).unwrap();
        if count == 100 {
            assert_eq!(
                *resolver.resolve(reference(1, 0)).unwrap(),
                PdfObject::from(true)
            );
        } else {
            assert!(matches!(
                resolver.resolve(reference(1, 0)),
                Err(ResolveError::TooDeep { limit: 100, .. })
            ));
        }
        assert_eq!(
            *resolver.resolve(reference(count, 0)).unwrap(),
            PdfObject::from(true)
        );
    }
}

#[test]
fn legitimate_dictionary_back_reference_is_left_lazy() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Parent 1 0 R >>");
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    assert!(matches!(
        resolver.resolve(reference(1, 0)).unwrap().as_ref(),
        PdfObject::Dictionary(_)
    ));
}

#[test]
fn resolves_indirect_length_and_detects_reentry_through_length() {
    for length in ["3", "1 0 R", "-1", "(wrong)", "[broken"] {
        let mut pdf = PdfFixture::new();
        pdf.object(1, 0, "<< /Length 2 0 R >>\nstream\nabc\nendstream");
        pdf.object(2, 0, length);
        pdf.object(3, 0, "17");
        let data = pdf.finish("");
        let mut resolver = ObjectResolver::open(&data).unwrap();
        match length {
            "3" => assert!(matches!(
                resolver.resolve(reference(1, 0)).unwrap().as_ref(),
                PdfObject::Stream(_)
            )),
            "1 0 R" => assert!(matches!(
                resolver.resolve(reference(1, 0)),
                Err(ResolveError::Cycle(_))
            )),
            "-1" | "(wrong)" => assert!(matches!(
                resolver.resolve(reference(1, 0)),
                Err(ResolveError::InvalidLength { .. })
            )),
            _ => assert!(matches!(
                resolver.resolve(reference(1, 0)),
                Err(ResolveError::Parse(_))
            )),
        }
        assert_eq!(
            *resolver.resolve(reference(3, 0)).unwrap(),
            PdfObject::from(17)
        );
    }
}

#[test]
fn detects_object_stream_length_reentry() {
    let input = b"%PDF-1.7\n8 0 obj << /Type /ObjStm /N 1 /First 4 /Length 1 0 R >> stream\n1 0 3\nendstream\nendobj";
    let mut table = XRefTable::new();
    table.insert(
        ObjectNumber::new(1).unwrap(),
        XRefEntry::InObjectStream {
            stream_object: ObjectNumber::new(8).unwrap(),
            index_in_stream: 0,
        },
    );
    table.insert(
        ObjectNumber::new(8).unwrap(),
        XRefEntry::InUse {
            offset: ByteOffset::new(9),
            generation: GenerationNumber::new(0),
        },
    );
    let mut resolver = ObjectResolver::new(input, PdfHeader::parse(input).unwrap(), table);
    assert!(matches!(
        resolver.resolve(reference(1, 0)),
        Err(ResolveError::Cycle(_))
    ));
}
