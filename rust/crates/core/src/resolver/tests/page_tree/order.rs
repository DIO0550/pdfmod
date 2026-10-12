use super::*;

#[test]
fn flat_tree_follows_kids_not_object_number_or_file_order() {
    let mut pdf = fixture("<< /Type /Pages /Kids [5 0 R 3 0 R 4 0 R] /Count 3 >>");
    for number in [3, 4, 5] {
        pdf.object(number, 0, "<< /Type /Page /Parent 2 0 R >>");
    }
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(
        references(&tree),
        [reference(5, 0), reference(3, 0), reference(4, 0)]
    );
    assert!(tree.warnings().is_empty());
}

#[test]
fn uneven_multilevel_tree_is_depth_first_and_counts_all_descendants() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 4 >>");
    pdf.object(
        3,
        0,
        "<< /Type /Pages /Parent 2 0 R /Kids [6 0 R 7 0 R] /Count 2 >>",
    );
    pdf.object(4, 0, "<< /Type /Page /Parent 2 0 R >>");
    pdf.object(
        5,
        0,
        "<< /Type /Pages /Parent 2 0 R /Kids [8 0 R] /Count 1 >>",
    );
    pdf.object(6, 0, "<< /Type /Page /Parent 3 0 R >>");
    pdf.object(
        7,
        0,
        "<< /Type /Pages /Parent 3 0 R /Kids [9 0 R] /Count 1 >>",
    );
    pdf.object(8, 0, "<< /Type /Page /Parent 5 0 R >>");
    pdf.object(9, 0, "<< /Type /Page /Parent 7 0 R >>");
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(
        references(&tree),
        [
            reference(6, 0),
            reference(9, 0),
            reference(4, 0),
            reference(8, 0)
        ]
    );
    assert!(tree.warnings().is_empty());
}

#[test]
fn count_mismatches_report_each_subtree_without_truncating_pages() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 0 >>");
    pdf.object(3, 0, "<< /Type /Pages /Kids [5 0 R] /Count 99 >>");
    pdf.object(4, 0, "<< /Type /Page /Parent 2 0 R >>");
    pdf.object(5, 0, "<< /Type /Page /Parent 3 0 R >>");
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(references(&tree), [reference(5, 0), reference(4, 0)]);
    assert_eq!(
        tree.warnings(),
        [
            PageTreeWarning::CountMismatch {
                node: reference(3, 0).target(),
                declared: 99,
                actual: 1
            },
            PageTreeWarning::CountMismatch {
                node: reference(2, 0).target(),
                declared: 0,
                actual: 2
            },
        ]
    );
    assert!(tree.page(PageIndex::from(1)).is_some());
    assert!(tree.page(PageIndex::from(2)).is_none());
}

#[test]
fn empty_kids_returns_no_pages_even_if_count_claims_pages() {
    for count in [0, 7] {
        let data = fixture(&format!("<< /Type /Pages /Kids [] /Count {count} >>")).finish("");
        let tree = walk(&data).unwrap();
        assert!(tree.pages().is_empty());
        assert!(tree.page(PageIndex::from(0)).is_none());
        assert_eq!(tree.warnings().len(), usize::from(count != 0));
    }
}

#[test]
fn single_page_has_typed_access_and_shares_the_unmodified_dictionary() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 2 R] /Count 1 >>");
    pdf.object(3, 2, "<< /Type /Page /Parent 2 0 R /Contents 9 0 R >>");
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    let catalog = resolver.catalog().unwrap();
    let tree = resolver.page_tree(&catalog).unwrap();
    let first = PageNumber::new(1).unwrap();
    let page = tree.page(first.into()).unwrap();
    assert_eq!(page.reference(), reference(3, 2));
    assert!(std::ptr::eq(
        page.object(),
        resolver.resolve(reference(3, 2)).unwrap().as_ref()
    ));
    let PdfObject::Dictionary(dictionary) = page.object() else {
        panic!("page dictionary")
    };
    assert_eq!(
        dictionary.get(b"Contents".as_slice()),
        Some(&PdfObject::Reference(reference(9, 0)))
    );
    assert!(tree.page(PageIndex::from(1)).is_none());
    assert!(tree.page(PageIndex::from(usize::MAX)).is_none());
}

#[test]
fn missing_type_uses_kids_before_parent_and_warns_for_both_node_kinds() {
    let mut pdf = fixture("<< /Kids [3 0 R] /Count 1 >>");
    pdf.object(3, 0, "<< /Parent 2 0 R /Kids [4 0 R] /Count 1 >>");
    pdf.object(4, 0, "<< /Type null /Parent 3 0 R >>");
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(references(&tree), [reference(4, 0)]);
    assert_eq!(
        tree.warnings(),
        [
            PageTreeWarning::InferredType {
                node: reference(2, 0).target(),
                inferred: PageNodeKind::Pages
            },
            PageTreeWarning::InferredType {
                node: reference(3, 0).target(),
                inferred: PageNodeKind::Pages
            },
            PageTreeWarning::InferredType {
                node: reference(4, 0).target(),
                inferred: PageNodeKind::Page
            },
        ]
    );
}

#[test]
fn indirect_type_kids_and_count_are_resolved_but_page_attributes_are_not() {
    let mut pdf = fixture("<< /Type 8 0 R /Kids 9 0 R /Count 10 0 R >>");
    pdf.object(8, 0, "/Pages");
    pdf.object(9, 0, "[3 0 R]");
    pdf.object(10, 0, "1");
    pdf.object(3, 0, "<< /Type 11 0 R /Parent 2 0 R /Contents 12 0 R >>");
    pdf.object(11, 0, "/Page");
    pdf.object(12, 0, "[ malformed");
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(references(&tree), [reference(3, 0)]);
    assert!(tree.warnings().is_empty());
}

#[test]
fn missing_null_negative_and_noninteger_count_warn_without_losing_pages() {
    for (entry, warning) in [
        (
            "",
            PageTreeWarning::MissingCount {
                node: reference(2, 0).target(),
            },
        ),
        (
            "/Count null",
            PageTreeWarning::MissingCount {
                node: reference(2, 0).target(),
            },
        ),
        (
            "/Count -1",
            PageTreeWarning::InvalidCount {
                node: reference(2, 0).target(),
                actual: ObjectKind::Integer,
            },
        ),
        (
            "/Count 1.0",
            PageTreeWarning::InvalidCount {
                node: reference(2, 0).target(),
                actual: ObjectKind::Real,
            },
        ),
        (
            "/Count (1)",
            PageTreeWarning::InvalidCount {
                node: reference(2, 0).target(),
                actual: ObjectKind::String,
            },
        ),
    ] {
        let mut pdf = fixture(&format!("<< /Type /Pages /Kids [3 0 R] {entry} >>"));
        pdf.object(3, 0, "<< /Type /Page /Parent 2 0 R >>");
        let tree = walk(&pdf.finish("")).unwrap();
        assert_eq!(references(&tree), [reference(3, 0)]);
        assert_eq!(tree.warnings(), [warning]);
    }
}
