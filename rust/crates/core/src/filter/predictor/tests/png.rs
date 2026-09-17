use crate::byte_offset::ByteOffset;
use crate::filter::predictor::{decode_png_predictor, decode_predictor, PredictorParams};

// TC-PNG-01: PNG None (Tag 0) 単一行の透過デコード
#[test]
fn png_filter_none_single_row() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(10, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    let data = [0, 10, 20, 30];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 20, 30]);

    // decode_predictor ディスパッチの同一性検証
    let via_dispatch = decode_predictor(&data, &params, pos).expect("dispatch should succeed");
    assert_eq!(via_dispatch, decoded);
}

// TC-PNG-02: PNG Sub (Tag 1) 同一行左バイト加算
#[test]
fn png_filter_sub_left_byte_addition() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(11, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    let data = [1, 5, 3, 2];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![5, 8, 10]);
}

// TC-PNG-03: PNG Up (Tag 2) 複数行の直上バイト加算
#[test]
fn png_filter_up_above_byte_addition() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(12, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    let data = [2, 1, 2, 3, 2, 10, 20, 30];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![1, 2, 3, 11, 22, 33]);
}

// TC-PNG-04: PNG Average (Tag 3) 左と直上の切り捨て平均加算
#[test]
fn png_filter_average_floor_mean_addition() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(13, Some(1), None, Some(2), pos)
        .expect("valid parameters should construct");

    let data = [3, 4, 6, 3, 2, 4];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![4, 8, 4, 10]);
}

// TC-PNG-05: PNG Paeth (Tag 4) 近傍予測子加算
#[test]
fn png_filter_paeth_predictor_addition() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(14, Some(1), None, Some(2), pos)
        .expect("valid parameters should construct");

    let data = [4, 10, 20, 4, 5, 5];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 30, 15, 35]);
}

// TC-PNG-06: PNG Optimum (Tag 混合複数行)
#[test]
fn png_filter_optimum_mixed_rows() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(15, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    // Row0: Tag 0 (None) -> [10, 20, 30]
    // Row1: Tag 2 (Up) -> [5+10, 5+20, 5+30] = [15, 25, 35]
    // Row2: Tag 1 (Sub) -> [1, 2+1, 3+3] = [1, 3, 6]
    let data = [0, 10, 20, 30, 2, 5, 5, 5, 1, 1, 2, 3];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 20, 30, 15, 25, 35, 1, 3, 6]);
}

// TC-PNG-07: PNG 加算の 255 超過ラップ (mod 256)
#[test]
fn png_filter_wrapping_addition() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(12, Some(1), None, Some(1), pos)
        .expect("valid parameters should construct");

    let data = [0, 200, 2, 100];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![200, 44]); // 200 + 100 = 300 % 256 = 44
}

// TC-PNG-08: PNG 空データ入力
#[test]
fn png_filter_empty_data() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(10, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    let data = [];
    let decoded = decode_png_predictor(&data, &params, pos).expect("empty data should succeed");
    assert!(decoded.is_empty());
}

// TC-PNG-09: PNG Sub (Tag 1) 複数成分 (Colors=3 RGB)
#[test]
fn png_filter_sub_multi_component_rgb() {
    let pos = ByteOffset::new(0);
    let params = PredictorParams::new(11, Some(3), None, Some(2), pos)
        .expect("valid parameters should construct");

    let data = [1, 10, 20, 30, 5, 2, 1];
    let decoded = decode_png_predictor(&data, &params, pos).expect("decoding should succeed");
    assert_eq!(decoded, vec![10, 20, 30, 15, 22, 31]);
}
