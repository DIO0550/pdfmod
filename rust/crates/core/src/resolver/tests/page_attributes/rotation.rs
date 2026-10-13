use super::*;

#[test]
fn rotations_normalize_negative_and_large_multiples_without_overflow() {
    for (degrees, expected) in [
        (0, 0),
        (90, 90),
        (180, 180),
        (270, 270),
        (-90, 270),
        (-450, 270),
        (450, 90),
        (720, 0),
        (i64::MAX - 7, 0),
        (i64::MIN + 8, 0),
    ] {
        let pdf = fixture(
            "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
            &format!("<< /Type /Page /Parent 2 0 R /Rotate {degrees} >>"),
        );
        let result = attributes(&pdf.finish("")).unwrap();
        assert_eq!(result.rotation().degrees(), expected);
        assert!(result.warnings().is_empty());
    }
}

#[test]
fn invalid_rotation_warns_and_falls_back_to_parent_or_zero() {
    for parent in ["", "/Rotate 180"] {
        let pdf = fixture(
            &format!("<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] {parent} >>"),
            "<< /Type /Page /Parent 2 0 R /Rotate 91 >>",
        );
        let result = attributes(&pdf.finish("")).unwrap();
        assert_eq!(result.warnings().len(), 1);
        assert_eq!(
            result.warnings()[0].kind(),
            &PageAttributeWarningKind::InvalidRotation { degrees: 91 }
        );
        let expected = if parent.is_empty() { 0 } else { 180 };
        assert_eq!(result.rotation().degrees(), expected);
    }
    assert!(PageRotation::new(i64::MIN).is_none());
    assert!(PageRotation::new(i64::MAX).is_none());
}
