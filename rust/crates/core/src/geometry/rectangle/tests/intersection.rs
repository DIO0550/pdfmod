use super::*;

#[test]
fn returns_only_shared_coordinates_for_partial_overlap_and_containment() {
    let media = parse(b"[0 0 100 200]").unwrap();
    for (input, expected) in [
        (b"[-10 20 120 180]".as_slice(), b"[0 20 100 180]".as_slice()),
        (b"[-10 -20 120 220]", b"[0 0 100 200]"),
        (b"[10 20 90 180]", b"[10 20 90 180]"),
    ] {
        let other = parse(input).unwrap();
        assert_eq!(media.intersection(&other), Some(parse(expected).unwrap()));
        assert_eq!(media.intersection(&other), other.intersection(&media));
    }
}

#[test]
fn distinguishes_disjoint_rectangles_from_touching_edges_and_points() {
    let media = parse(b"[0 0 100 200]").unwrap();
    for input in [
        b"[101 0 120 10]".as_slice(),
        b"[-20 0 -1 10]",
        b"[0 201 10 220]",
        b"[0 -20 10 -1]",
    ] {
        assert_eq!(media.intersection(&parse(input).unwrap()), None);
    }
    for (input, size) in [
        (b"[100 20 110 30]".as_slice(), (0.0, 10.0)),
        (b"[100 200 110 220]", (0.0, 0.0)),
        (b"[10 20 10 20]", (0.0, 0.0)),
    ] {
        let result = media.intersection(&parse(input).unwrap()).unwrap();
        assert_eq!((result.width(), result.height()), size);
    }
}
