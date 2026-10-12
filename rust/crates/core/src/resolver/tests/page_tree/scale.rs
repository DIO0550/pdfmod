use super::*;

#[test]
fn ten_thousand_levels_are_walked_without_recursion_or_a_tree_depth_limit() {
    let mut pdf = fixture("<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
    for number in 3..10_003 {
        pdf.object(
            number,
            0,
            &format!("<< /Type /Pages /Kids [{} 0 R] /Count 1 >>", number + 1),
        );
    }
    pdf.object(10_003, 0, "<< /Type /Page /Parent 10002 0 R >>");
    let tree = walk(&pdf.finish("")).unwrap();
    assert_eq!(references(&tree), [reference(10_003, 0)]);
    assert!(tree.warnings().is_empty());
}

#[test]
fn wide_tree_keeps_document_order_without_trusting_a_huge_count() {
    let kids = (3..1003)
        .rev()
        .map(|number| format!("{number} 0 R"))
        .collect::<Vec<_>>()
        .join(" ");
    let mut pdf = fixture(&format!(
        "<< /Type /Pages /Kids [{kids}] /Count 9223372036854775807 >>"
    ));
    for number in 3..1003 {
        pdf.object(number, 0, "<< /Type /Page /Parent 2 0 R >>");
    }
    let tree = walk(&pdf.finish("")).unwrap();
    let expected: Vec<_> = (3..1003).rev().map(|number| reference(number, 0)).collect();
    assert_eq!(references(&tree), expected);
    assert_eq!(
        tree.warnings(),
        [PageTreeWarning::CountMismatch {
            node: reference(2, 0).target(),
            declared: 9_223_372_036_854_775_807,
            actual: 1000
        }]
    );
}
