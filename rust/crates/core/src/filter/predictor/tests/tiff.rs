use crate::byte_offset::ByteOffset;
use crate::filter::predictor::{decode_predictor, decode_tiff_predictor, PredictorParams};

// TC-TIFF-01: TIFF Predictor 2 単一成分 (Colors=1)
#[test]
fn tiff_predictor_single_component() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(2, Some(1), None, Some(4), pos)
        .expect("valid parameters should construct");

    let data = [10, 5, 2, 1];
    let decoded = decode_tiff_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 15, 17, 18]);

    // decode_predictor ディスパッチの同一性検証
    let via_dispatch = decode_predictor(&data, &params, pos).expect("dispatch should succeed");
    assert_eq!(via_dispatch, decoded);
}

// TC-TIFF-02: TIFF Predictor 2 複数成分 (Colors=3 RGB)
#[test]
fn tiff_predictor_multi_component_rgb() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(2, Some(3), None, Some(2), pos)
        .expect("valid parameters should construct");

    let data = [10, 20, 30, 5, 2, 1];
    let decoded = decode_tiff_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 20, 30, 15, 22, 31]);
}

// TC-TIFF-03: TIFF Predictor 2 複数行の独立性
#[test]
fn tiff_predictor_multi_row_independence() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(2, Some(1), None, Some(2), pos)
        .expect("valid parameters should construct");

    let data = [10, 5, 20, 3];
    let decoded = decode_tiff_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 15, 20, 23]);
}

// TC-TIFF-04: TIFF Predictor 2 wrapping 加算
#[test]
fn tiff_predictor_wrapping_addition() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(2, Some(1), None, Some(2), pos)
        .expect("valid parameters should construct");

    let data = [250, 10];
    let decoded = decode_tiff_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![250, 4]); // 250 + 10 = 260 % 256 = 4
}

// TC-TIFF-05: TIFF Predictor 2 空データ入力
#[test]
fn tiff_predictor_empty_data() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(2, Some(1), None, Some(4), pos)
        .expect("valid parameters should construct");

    let data = [];
    let decoded = decode_tiff_predictor(&data, &params, pos).expect("empty data should succeed");
    assert!(decoded.is_empty());
}
