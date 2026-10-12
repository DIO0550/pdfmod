use super::*;

#[test]
fn self_reference_reports_the_ancestor_including_its_generation() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Type /Catalog /Pages 2 7 R >>");
    pdf.object(2, 7, "<< /Type /Pages /Kids [2 7 R] /Count 0 >>");
    assert_eq!(
        walk(&pdf.finish("")).unwrap_err(),
        PageTreeError::Cycle {
            node: reference(2, 7).target()
        }
    );
}

#[test]
fn two_nodes_pointing_to_each_other_are_a_tree_cycle() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 0 >>");
    pdf.object(
        3,
        0,
        "<< /Type /Pages /Parent 2 0 R /Kids [2 0 R] /Count 0 >>",
    );
    assert_eq!(
        walk(&pdf.finish("")).unwrap_err(),
        PageTreeError::Cycle {
            node: reference(2, 0).target()
        }
    );
}

#[test]
fn a_deep_cycle_reports_the_reentered_branch_instead_of_the_root() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 0 >>");
    for number in 3..10_003 {
        pdf.object(
            number,
            0,
            &format!("<< /Type /Pages /Kids [{} 0 R] /Count 0 >>", number + 1),
        );
    }
    pdf.object(10_003, 0, "<< /Type /Pages /Kids [5003 0 R] /Count 0 >>");
    assert_eq!(
        walk(&pdf.finish("")).unwrap_err(),
        PageTreeError::Cycle {
            node: reference(5003, 0).target()
        }
    );
}

#[test]
fn tree_cycles_are_detected_with_preloaded_dictionaries_and_without_a_cache() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 0 >>");
    pdf.object(3, 0, "<< /Type /Pages /Kids [2 0 R] /Count 0 >>");
    let data = pdf.finish("");
    for capacity in [0, 1024] {
        let mut resolver = ObjectResolver::open(&data).unwrap();
        resolver.set_cache_capacity(capacity);
        let catalog = resolver.catalog().unwrap();
        for number in [2, 3] {
            assert!(matches!(
                resolver.resolve(reference(number, 0)).unwrap().as_ref(),
                PdfObject::Dictionary(_)
            ));
        }
        assert_eq!(
            resolver.page_tree(&catalog).unwrap_err(),
            PageTreeError::Cycle {
                node: reference(2, 0).target()
            }
        );
    }
}

#[test]
fn a_leaf_shared_by_two_parents_is_rejected_as_a_repeat_not_a_cycle() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
    pdf.object(
        3,
        0,
        "<< /Type /Pages /Parent 2 0 R /Kids [5 0 R] /Count 1 >>",
    );
    pdf.object(
        4,
        0,
        "<< /Type /Pages /Parent 2 0 R /Kids [5 0 R] /Count 1 >>",
    );
    pdf.object(5, 0, "<< /Type /Page /Parent 3 0 R >>");
    assert_eq!(
        walk(&pdf.finish("")).unwrap_err(),
        PageTreeError::RepeatedNode {
            node: reference(5, 0).target()
        }
    );
}

#[test]
fn a_branch_shared_by_two_parents_is_not_an_ancestor_after_leaving_it() {
    for count in ["/Count 1", "", "/Count -1"] {
        let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
        pdf.object(
            3,
            0,
            "<< /Type /Pages /Parent 2 0 R /Kids [5 0 R] /Count 1 >>",
        );
        pdf.object(
            4,
            0,
            "<< /Type /Pages /Parent 2 0 R /Kids [5 0 R] /Count 1 >>",
        );
        pdf.object(
            5,
            0,
            &format!("<< /Type /Pages /Parent 3 0 R /Kids [6 0 R] {count} >>"),
        );
        pdf.object(6, 0, "<< /Type /Page /Parent 5 0 R >>");
        assert_eq!(
            walk(&pdf.finish("")).unwrap_err(),
            PageTreeError::RepeatedNode {
                node: reference(5, 0).target()
            }
        );
    }
}

#[test]
fn duplicate_siblings_are_rejected_for_leaves_and_branches() {
    for child in [
        "<< /Type /Page /Parent 2 0 R >>",
        "<< /Type /Pages /Parent 2 0 R /Kids [] /Count 0 >>",
    ] {
        let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 3 0 R] /Count 2 >>");
        pdf.object(3, 0, child);
        assert_eq!(
            walk(&pdf.finish("")).unwrap_err(),
            PageTreeError::RepeatedNode {
                node: reference(3, 0).target()
            }
        );
    }
}

#[test]
fn separate_branches_with_equal_dictionaries_are_distinct_nodes() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 1 >>");
    for number in [3, 4] {
        pdf.object(number, 0, "<< /Type /Pages /Parent 2 0 R /Kids [] >>");
    }
    pdf.object(5, 0, "<< /Type /Page /Parent 2 0 R >>");
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(references(&tree), [reference(5, 0)]);
    assert_eq!(
        tree.warnings(),
        [
            PageTreeWarning::MissingCount {
                node: reference(3, 0).target()
            },
            PageTreeWarning::MissingCount {
                node: reference(4, 0).target()
            }
        ]
    );
}

#[test]
fn non_reference_kids_report_the_parent_index_and_actual_kind() {
    for (kid, actual) in [
        ("null", ObjectKind::Null),
        ("42", ObjectKind::Integer),
        ("/Page", ObjectKind::Name),
        ("[]", ObjectKind::Array),
        ("<< /Type /Page >>", ObjectKind::Dictionary),
    ] {
        let mut pdf = fixture(&format!("<< /Type /Pages /Kids [3 0 R {kid}] /Count 2 >>"));
        pdf.object(3, 0, "<< /Type /Page /Parent 2 0 R >>");
        assert_eq!(
            walk(&pdf.finish("")).unwrap_err(),
            PageTreeError::InvalidKid {
                node: reference(2, 0).target(),
                index: 1,
                actual
            }
        );
    }
}

#[test]
fn unresolved_or_non_dictionary_children_do_not_return_a_partial_page_list() {
    for (child, actual) in [
        (None, ObjectKind::Null),
        (Some("null"), ObjectKind::Null),
        (Some("42"), ObjectKind::Integer),
        (Some("[]"), ObjectKind::Array),
    ] {
        let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>");
        pdf.object(3, 0, "<< /Type /Page /Parent 2 0 R >>");
        if let Some(child) = child {
            pdf.object(4, 0, child);
        }
        assert_eq!(
            walk(&pdf.finish("")).unwrap_err(),
            PageTreeError::NotADictionary {
                node: reference(4, 0).target(),
                actual
            }
        );
    }
}

#[test]
fn a_reference_to_another_generation_is_not_mistaken_for_a_cycle() {
    let pdf = fixture("<< /Type /Pages /Kids [2 1 R] /Count 0 >>");
    assert_eq!(
        walk(&pdf.finish("")).unwrap_err(),
        PageTreeError::Resolution {
            node: reference(2, 1).target(),
            key: None,
            cause: ResolveError::GenerationMismatch {
                requested: reference(2, 1).target(),
                actual: GenerationNumber::new(0)
            }
        }
    );
}

#[test]
fn a_child_reference_chain_cycle_preserves_the_resolver_error() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 0 >>");
    pdf.object(3, 0, "4 0 R");
    pdf.object(4, 0, "3 0 R");
    assert_eq!(
        walk(&pdf.finish("")).unwrap_err(),
        PageTreeError::Resolution {
            node: reference(3, 0).target(),
            key: None,
            cause: ResolveError::Cycle(vec![
                reference(3, 0).target(),
                reference(4, 0).target(),
                reference(3, 0).target()
            ])
        }
    );
}
