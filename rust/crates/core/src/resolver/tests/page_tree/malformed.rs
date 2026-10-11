use super::*;

#[test]
fn invalid_root_and_unknown_or_malformed_type_are_errors() {
    let node = reference(2, 0).target();
    for (root, expected) in [
        (
            "null",
            PageTreeError::NotADictionary {
                node,
                actual: ObjectKind::Null,
            },
        ),
        (
            "42",
            PageTreeError::NotADictionary {
                node,
                actual: ObjectKind::Integer,
            },
        ),
        ("<< >>", PageTreeError::CannotInferType { node }),
        (
            "<< /Type /Other /Kids [] >>",
            PageTreeError::InvalidType { node },
        ),
        (
            "<< /Type (Pages) /Kids [] >>",
            PageTreeError::InvalidKeyType {
                node,
                key: PageTreeKey::Type,
                actual: ObjectKind::String,
            },
        ),
        ("<< /Type /Page >>", PageTreeError::RootIsPage { node }),
        ("<< /Type /Pages >>", PageTreeError::MissingKids { node }),
        (
            "<< /Type /Pages /Kids null >>",
            PageTreeError::MissingKids { node },
        ),
        (
            "<< /Type /Pages /Kids 42 >>",
            PageTreeError::InvalidKeyType {
                node,
                key: PageTreeKey::Kids,
                actual: ObjectKind::Integer,
            },
        ),
        (
            "<< /Type /Pages /Kids [null] >>",
            PageTreeError::InvalidKid {
                node,
                index: 0,
                actual: ObjectKind::Null,
            },
        ),
        (
            "<< /Type /Pages /Kids [<< /Type /Page >>] >>",
            PageTreeError::InvalidKid {
                node,
                index: 0,
                actual: ObjectKind::Dictionary,
            },
        ),
    ] {
        assert_eq!(walk(&fixture(root).finish("")).unwrap_err(), expected);
    }
}

#[test]
fn a_missing_child_and_an_unidentifiable_dictionary_are_not_skipped() {
    for body in [None, Some("<< /Parent null >>")] {
        let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
        if let Some(body) = body {
            pdf.object(3, 0, body);
        }
        let error = walk(&pdf.finish("")).unwrap_err();
        match body {
            None => assert_eq!(
                error,
                PageTreeError::NotADictionary {
                    node: reference(3, 0).target(),
                    actual: ObjectKind::Null
                }
            ),
            Some(_) => assert_eq!(
                error,
                PageTreeError::CannotInferType {
                    node: reference(3, 0).target()
                }
            ),
        }
    }
}

#[test]
fn cycles_and_duplicate_leaves_are_rejected_instead_of_looping_or_duplicating() {
    for body in [
        "<< /Type /Pages /Kids [2 0 R] /Count 1 >>",
        "<< /Type /Pages /Kids [3 0 R 3 0 R] /Count 2 >>",
    ] {
        let mut pdf = fixture(body);
        pdf.object(3, 0, "<< /Type /Page /Parent 2 0 R >>");
        let node = if body.contains("[2") {
            reference(2, 0).target()
        } else {
            reference(3, 0).target()
        };
        assert_eq!(
            walk(&pdf.finish("")).unwrap_err(),
            PageTreeError::RepeatedNode { node }
        );
    }
}

#[test]
fn parse_errors_and_indirect_entry_cycles_preserve_the_resolver_cause() {
    for (root, key) in [
        (
            "<< /Type 3 0 R /Kids [] /Count 0 >>",
            Some(PageTreeKey::Type),
        ),
        (
            "<< /Type /Pages /Kids 3 0 R /Count 0 >>",
            Some(PageTreeKey::Kids),
        ),
        (
            "<< /Type /Pages /Kids [] /Count 3 0 R >>",
            Some(PageTreeKey::Count),
        ),
    ] {
        let mut pdf = fixture(root);
        pdf.object(3, 0, "3 0 R");
        let error = walk(&pdf.finish("")).unwrap_err();
        assert!(
            matches!(error, PageTreeError::Resolution { node, key: actual_key, cause: ResolveError::Cycle(_) } if node == reference(2, 0).target() && actual_key == key)
        );
    }
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    pdf.object(3, 0, "[ malformed");
    assert!(
        matches!(walk(&pdf.finish("")).unwrap_err(), PageTreeError::Resolution { node, key: None, cause: ResolveError::Parse(_) } if node == reference(3, 0).target())
    );
}
