use super::*;

#[test]
fn returns_same_allocation_on_hit_and_reparses_only_evicted_entries() {
    let mut pdf = PdfFixture::new();
    for n in 1..=3 {
        pdf.object(n, 0, &format!("({n})"));
    }
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    resolver.set_cache_capacity(2);
    let first = resolver.resolve(reference(1, 0)).unwrap();
    let second = resolver.resolve(reference(2, 0)).unwrap();
    assert!(Rc::ptr_eq(
        &first,
        &resolver.resolve(reference(1, 0)).unwrap()
    ));
    resolver.resolve(reference(3, 0)).unwrap();
    assert!(Rc::ptr_eq(
        &first,
        &resolver.resolve(reference(1, 0)).unwrap()
    ));
    let reloaded = resolver.resolve(reference(2, 0)).unwrap();
    assert_eq!(second, reloaded);
    assert!(!Rc::ptr_eq(&second, &reloaded));
    assert!(matches!(
        resolver.resolve(reference(1, 1)),
        Err(ResolveError::GenerationMismatch { .. })
    ));
    resolver.set_cache_capacity(0);
    let uncached = resolver.resolve(reference(1, 0)).unwrap();
    assert_eq!(first, uncached);
    assert!(!Rc::ptr_eq(
        &uncached,
        &resolver.resolve(reference(1, 0)).unwrap()
    ));
}

#[test]
fn warmed_alias_cache_does_not_bypass_depth_or_cycle_detection() {
    let mut pdf = PdfFixture::new();
    for n in 1..=100 {
        pdf.object(n, 0, &format!("{} 0 R", n + 1));
    }
    pdf.object(101, 0, "42");
    pdf.object(110, 0, "110 0 R");
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    resolver.resolve(reference(2, 0)).unwrap();
    assert!(matches!(
        resolver.resolve(reference(1, 0)),
        Err(ResolveError::TooDeep { .. })
    ));
    for _ in 0..2 {
        assert!(matches!(
            resolver.resolve(reference(110, 0)),
            Err(ResolveError::Cycle(_))
        ));
    }
}
