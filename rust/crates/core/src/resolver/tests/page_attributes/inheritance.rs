use super::*;

#[test]
fn direct_page_attributes_override_parents_per_key_without_merging_resources() {
    let pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 100 100] /CropBox [10 10 90 90] /Resources << /Font 9 0 R >> /Rotate 180 >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [612 792 0 0] /Resources << >> /Rotate 90 >>",
    );
    let result = attributes(&pdf.finish("")).unwrap();
    assert_eq!(result.media_box().width(), 612.0);
    assert_eq!(result.media_box().height(), 792.0);
    assert_eq!(result.crop_box().min_x(), 10.0);
    assert_eq!(result.crop_box().width(), 80.0);
    assert!(result.resources().is_empty());
    assert_eq!(result.rotation(), PageRotation::Degrees90);
    assert!(result.warnings().is_empty());
}

#[test]
fn all_four_attributes_can_be_inherited_from_parent_or_grandparent() {
    for parent_attributes in [true, false] {
        let inherited = "/MediaBox [0 0 612 792] /CropBox [10 20 600 700] /Resources << /Font 9 0 R >> /Rotate 270";
        let mut pdf = fixture(
            &format!(
                "<< /Type /Pages /Kids [4 0 R] /Count 1 {} >>",
                if parent_attributes { "" } else { inherited }
            ),
            "<< /Type /Page /Parent 4 0 R >>",
        );
        pdf.object(
            4,
            0,
            &format!(
                "<< /Type /Pages /Parent 2 0 R /Kids [3 0 R] /Count 1 {} >>",
                if parent_attributes { inherited } else { "" }
            ),
        );
        let result = attributes(&pdf.finish("")).unwrap();
        assert_eq!(result.media_box().width(), 612.0);
        assert_eq!(result.crop_box().min_y(), 20.0);
        assert_eq!(result.rotation(), PageRotation::Degrees270);
        assert_eq!(
            result.resources().get(b"Font".as_slice()),
            Some(&PdfObject::Reference(reference(9, 0)))
        );
        assert!(result.warnings().is_empty());
    }
}

#[test]
fn defaults_are_applied_only_after_the_whole_parent_chain() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 100 200] >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox null /Resources null /Rotate null >>",
    );
    let data = pdf.finish("");
    let result = attributes(&data).unwrap();
    assert_eq!(result.crop_box(), result.media_box());
    assert!(result.resources().is_empty());
    assert_eq!(result.rotation(), PageRotation::Degrees0);
    assert!(result.warnings().is_empty());

    pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox [0 0 100 200] /Rotate 90 >>",
        "<< /Type /Page /Parent 2 0 R /Rotate 0 >>",
    );
    assert_eq!(
        attributes(&pdf.finish("")).unwrap().rotation(),
        PageRotation::Degrees0
    );
}

#[test]
fn indirect_values_and_rectangle_coordinates_resolve_through_reference_chains() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox 5 0 R /CropBox 6 0 R /Resources 7 0 R /Rotate 8 0 R >>",
        "<< /Type /Page /Parent 2 0 R >>",
    );
    pdf.object(5, 0, "[0 0 9 0 R 792]");
    pdf.object(6, 0, "[10 0 600 10 0 R]");
    pdf.object(7, 0, "11 0 R");
    pdf.object(8, 0, "450");
    pdf.object(9, 0, "12 0 R");
    pdf.object(10, 0, "700");
    pdf.object(11, 0, "<< /Font 20 0 R >>");
    pdf.object(12, 0, "612.5");
    let result = attributes(&pdf.finish("")).unwrap();
    assert_eq!(result.media_box().width(), 612.5);
    assert_eq!(result.crop_box().height(), 700.0);
    assert_eq!(result.rotation(), PageRotation::Degrees90);
    assert_eq!(
        result.resources().get(b"Font".as_slice()),
        Some(&PdfObject::Reference(reference(20, 0)))
    );
    assert!(result.warnings().is_empty());
}

#[test]
fn invalid_local_and_intermediate_values_do_not_hide_valid_grandparent_attributes() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [4 0 R] /Count 1 /MediaBox [0 0 612 792] /CropBox [10 10 600 780] /Resources << >> /Rotate 90 >>",
        "<< /Type /Page /Parent 4 0 R /MediaBox [0 0] /CropBox /Invalid /Resources [] /Rotate 45 >>",
    );
    pdf.object(4, 0, "<< /Type /Pages /Parent 2 0 R /Kids [3 0 R] /Count 1 /MediaBox false /CropBox [0 /bad 10 10] /Resources 1 /Rotate 90.0 >>");
    let result = attributes(&pdf.finish("")).unwrap();
    assert_eq!(result.media_box().width(), 612.0);
    assert_eq!(result.crop_box().min_x(), 10.0);
    assert!(result.resources().is_empty());
    assert_eq!(result.rotation(), PageRotation::Degrees90);
    assert_eq!(result.warnings().len(), 8);
    let warnings: Vec<_> = result
        .warnings()
        .iter()
        .map(|warning| (warning.node(), warning.key()))
        .collect();
    for node in [3, 4] {
        for key in [
            PageAttributeKey::MediaBox,
            PageAttributeKey::CropBox,
            PageAttributeKey::Resources,
            PageAttributeKey::Rotate,
        ] {
            assert!(warnings.contains(&(reference(node, 0).target(), key)));
        }
    }
}

#[test]
fn siblings_resolve_independently_with_the_cache_disabled() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 /MediaBox [0 0 612 792] /Rotate 90 >>",
        "<< /Type /Page /Parent 2 0 R /Rotate 180 >>",
    );
    pdf.object(4, 0, "<< /Type /Page /Parent 2 0 R >>");
    let data = pdf.finish("");
    let mut resolver = ObjectResolver::open(&data).unwrap();
    resolver.set_cache_capacity(0);
    let catalog = resolver.catalog().unwrap();
    let tree = resolver.page_tree(&catalog).unwrap();
    for (index, degrees) in [(0, 180), (1, 90), (0, 180)] {
        let result = resolver
            .page_attributes(tree.page(PageIndex::from(index)).unwrap())
            .unwrap();
        assert_eq!(result.rotation().degrees(), degrees);
        assert!(result.warnings().is_empty());
    }
}

#[test]
fn valid_local_values_do_not_read_shadowed_invalid_parent_values() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [3 0 R] /Count 1 /MediaBox 8 0 R /CropBox 8 0 R /Resources 8 0 R /Rotate 8 0 R >>",
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /CropBox [0 0 600 700] /Resources << >> /Rotate 0 >>",
    );
    pdf.object(8, 0, "8 0 R");
    let result = attributes(&pdf.finish("")).unwrap();
    assert_eq!(result.crop_box().width(), 600.0);
    assert!(result.warnings().is_empty());
}

#[test]
fn parent_chains_deeper_than_reference_resolution_limit_are_iterative() {
    let mut pdf = fixture(
        "<< /Type /Pages /Kids [4 0 R] /Count 1 /MediaBox [0 0 612 792] >>",
        "<< /Type /Page /Parent 2051 0 R >>",
    );
    for number in 4..=2051 {
        let parent = if number == 4 { 2 } else { number - 1 };
        let child = if number == 2051 { 3 } else { number + 1 };
        pdf.object(
            number,
            0,
            &format!("<< /Type /Pages /Parent {parent} 0 R /Kids [{child} 0 R] /Count 1 >>"),
        );
    }
    let result = attributes(&pdf.finish("")).unwrap();
    assert_eq!(result.media_box().width(), 612.0);
    assert!(result.warnings().is_empty());
}
