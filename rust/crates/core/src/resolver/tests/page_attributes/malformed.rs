use super::*;

#[test]
fn missing_or_invalid_media_box_everywhere_is_an_error() {
    for entry in [
        "",
        "/MediaBox null",
        "/MediaBox [0 0]",
        "/MediaBox /Invalid",
    ] {
        let pdf = fixture(
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            &format!("<< /Type /Page /Parent 2 0 R {entry} >>"),
        );
        assert_eq!(
            attributes(&pdf.finish("")).unwrap_err(),
            PageAttributeError::MissingMediaBox {
                page: reference(3, 0).target()
            }
        );
    }
}

#[test]
fn invalid_attribute_references_warn_and_continue_to_parent() {
    for (body, expected) in [
        ("8 0 R", "cycle"),
        ("[ malformed", "parse"),
        ("null", "null"),
    ] {
        let mut pdf = fixture(
            "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
            "<< /Type /Page /Parent 2 0 R /MediaBox 8 0 R >>",
        );
        pdf.object(8, 0, body);
        let result = attributes(&pdf.finish("")).unwrap();
        assert_eq!(result.media_box().width(), 612.0);
        assert_eq!(result.warnings().len(), 1);
        assert_eq!(result.warnings()[0].node(), reference(3, 0).target());
        assert_eq!(result.warnings()[0].key(), PageAttributeKey::MediaBox);
        match expected {
            "cycle" => assert!(matches!(
                result.warnings()[0].kind(),
                PageAttributeWarningKind::Resolution(ResolveError::Cycle(_))
            )),
            "parse" => assert!(matches!(
                result.warnings()[0].kind(),
                PageAttributeWarningKind::Resolution(ResolveError::Parse(_))
            )),
            "null" => assert_eq!(
                result.warnings()[0].kind(),
                &PageAttributeWarningKind::InvalidType {
                    actual: ObjectKind::Null
                }
            ),
            _ => unreachable!(),
        }
    }
}

#[test]
fn unresolved_coordinate_warns_and_skips_the_whole_local_rectangle() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 8 0 R 792] >>",
    );
    pdf.object(8, 0, "8 0 R");
    let result = attributes(&pdf.finish("")).unwrap();
    assert_eq!(result.media_box().width(), 612.0);
    assert!(matches!(
        result.warnings()[0].kind(),
        PageAttributeWarningKind::Resolution(ResolveError::Cycle(_))
    ));
}

#[test]
fn missing_and_invalid_parents_are_errors_even_with_all_local_attributes() {
    for (entry, expected) in [
        (
            "",
            PageAttributeError::MissingParent {
                node: reference(3, 0).target(),
            },
        ),
        (
            "/Parent null",
            PageAttributeError::MissingParent {
                node: reference(3, 0).target(),
            },
        ),
        (
            "/Parent 42",
            PageAttributeError::InvalidParent {
                node: reference(3, 0).target(),
                actual: ObjectKind::Integer,
            },
        ),
    ] {
        let pdf = fixture(
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            &format!("<< /Type /Page {entry} /MediaBox [0 0 612 792] /CropBox [0 0 600 700] /Resources << >> /Rotate 0 >>"),
        );
        assert_eq!(attributes(&pdf.finish("")).unwrap_err(), expected);
    }
}

#[test]
fn intermediate_parent_must_reach_the_catalog_root() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [4 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
        "<< /Type /Page /Parent 4 0 R >>",
    );
    pdf.object(
        4,
        0,
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
    );
    assert_eq!(
        attributes(&pdf.finish("")).unwrap_err(),
        PageAttributeError::MissingParent {
            node: reference(4, 0).target()
        }
    );
}

#[test]
fn parent_cycles_include_generations_and_do_not_depend_on_cache() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 4 7 R /MediaBox [0 0 612 792] >>",
    );
    pdf.object(4, 7, "<< /Type /Pages /Parent 5 0 R >>");
    pdf.object(5, 0, "<< /Type /Pages /Parent 4 7 R >>");
    let data = pdf.finish("");
    for capacity in [0, 1024] {
        let mut resolver = ObjectResolver::open(&data).unwrap();
        resolver.set_cache_capacity(capacity);
        let catalog = resolver.catalog().unwrap();
        let tree = resolver.page_tree(&catalog).unwrap();
        assert_eq!(
            resolver.page_attributes(&tree.pages()[0]).unwrap_err(),
            PageAttributeError::ParentCycle {
                node: reference(4, 7).target()
            }
        );
    }
}

#[test]
fn unresolved_and_non_dictionary_parents_are_fatal() {
    for body in [None, Some("42"), Some("4 0 R")] {
        let mut pdf = fixture(
            "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            "<< /Type /Page /Parent 4 0 R /MediaBox [0 0 612 792] >>",
        );
        if let Some(body) = body {
            pdf.object(4, 0, body);
        }
        let error = attributes(&pdf.finish("")).unwrap_err();
        match body {
            None => assert_eq!(
                error,
                PageAttributeError::NotADictionary {
                    node: reference(4, 0).target(),
                    actual: ObjectKind::Null
                }
            ),
            Some("42") => assert_eq!(
                error,
                PageAttributeError::NotADictionary {
                    node: reference(4, 0).target(),
                    actual: ObjectKind::Integer
                }
            ),
            Some(_) => assert!(
                matches!(error, PageAttributeError::ParentResolution { node, cause: ResolveError::Cycle(_) } if node == reference(3, 0).target())
            ),
        }
    }
}

#[test]
fn the_catalog_root_cannot_have_a_parent() {
    let pdf = fixture(
        "<< /Type /Pages /Parent 2 0 R /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
        "<< /Type /Page /Parent 2 0 R >>",
    );
    assert_eq!(
        attributes(&pdf.finish("")).unwrap_err(),
        PageAttributeError::RootHasParent {
            node: reference(2, 0).target()
        }
    );
}

#[test]
fn self_parent_and_invalid_coordinate_type_are_distinguished() {
    let pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        "<< /Type /Page /Parent 3 0 R /MediaBox [0 0 612 792] >>",
    );
    assert_eq!(
        attributes(&pdf.finish("")).unwrap_err(),
        PageAttributeError::ParentCycle {
            node: reference(3, 0).target()
        }
    );

    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 8 0 R 792] >>",
    );
    pdf.object(8, 0, "<< >>");
    let result = attributes(&pdf.finish("")).unwrap();
    assert!(matches!(
        result.warnings()[0].kind(),
        PageAttributeWarningKind::InvalidRectangle(
            crate::geometry::rectangle::RectangleError::InvalidElement {
                index: 2,
                actual: ObjectKind::Dictionary
            }
        )
    ));
}
