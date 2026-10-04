use super::*;

#[test]
fn omitted_and_null_boxes_default_to_normalized_media() {
    for input in [
        b"<< /MediaBox [612 792 0 0] >>".as_slice(),
        b"<< /MediaBox [612 792 0 0] /CropBox null /BleedBox null /TrimBox null /ArtBox null >>",
    ] {
        let boxes = parse(input).unwrap();
        assert_eq!(
            (boxes.media_box().width(), boxes.media_box().height()),
            (612.0, 792.0)
        );
        for rectangle in [
            boxes.crop_box(),
            boxes.bleed_box(),
            boxes.trim_box(),
            boxes.art_box(),
        ] {
            assert_eq!(bounds(&rectangle.unwrap()), [0.0, 0.0, 612.0, 792.0]);
        }
    }
}

#[test]
fn crop_is_intersected_with_media_and_other_defaults_follow_it() {
    let boxes = parse(b"<< /MediaBox [0 0 100 200] /CropBox [120 180 -10 20] >>").unwrap();
    for rectangle in [
        boxes.crop_box(),
        boxes.bleed_box(),
        boxes.trim_box(),
        boxes.art_box(),
    ] {
        assert_eq!(bounds(&rectangle.unwrap()), [0.0, 20.0, 100.0, 180.0]);
    }
}

#[test]
fn explicit_boxes_are_independent_of_crop_and_each_other() {
    let boxes = parse(b"<< /MediaBox [0 0 100 200] /CropBox [20 30 80 170] /BleedBox [-10 -20 110 220] /TrimBox [10 15 90 185] /ArtBox [95 190 5 10] >>").unwrap();
    assert_eq!(
        bounds(&boxes.bleed_box().unwrap()),
        [0.0, 0.0, 100.0, 200.0]
    );
    assert_eq!(
        bounds(&boxes.trim_box().unwrap()),
        [10.0, 15.0, 90.0, 185.0]
    );
    assert_eq!(bounds(&boxes.art_box().unwrap()), [5.0, 10.0, 95.0, 190.0]);
    assert_eq!(
        bounds(&boxes.crop_box().unwrap()),
        [20.0, 30.0, 80.0, 170.0]
    );
}

#[test]
fn disjoint_crop_produces_no_effective_default_boxes() {
    let boxes =
        parse(b"<< /MediaBox [0 0 100 200] /CropBox [110 10 120 20] /ArtBox [10 20 30 40] >>")
            .unwrap();
    assert_eq!(boxes.crop_box(), None);
    assert_eq!(boxes.bleed_box(), None);
    assert_eq!(boxes.trim_box(), None);
    assert!(boxes.art_box().is_some());
}

#[test]
fn zero_area_media_is_preserved() {
    let boxes = parse(b"<< /MediaBox [5 10 5 20] >>").unwrap();
    let crop = boxes.crop_box().unwrap();
    assert_eq!((crop.width(), crop.height()), (0.0, 10.0));
}
