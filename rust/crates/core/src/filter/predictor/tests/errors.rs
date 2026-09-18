use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateErrorKind;
use crate::filter::predictor::{
    decode_png_predictor, decode_predictor, decode_tiff_predictor, PredictorParams,
};

// TC-ERR-01: PNG データ長不一致エラー
#[test]
fn png_data_length_mismatch_error() {
    let pos = ByteOffset::new(10);
    // columns = 3, colors = 1 -> row_bytes = 3, record_size = 4
    let params = PredictorParams::new(10, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    let data = [0, 1, 2, 3, 4]; // len = 5 (not multiple of 4)
    let err = decode_png_predictor(&data, &params, pos).unwrap_err();
    assert_eq!(
        err.kind,
        FlateErrorKind::PredictorDataLengthMismatch {
            expected_multiple_of: 4,
            actual: 5,
        }
    );
    assert_eq!(err.position, pos);
}

// TC-ERR-02: TIFF データ長不一致エラー
#[test]
fn tiff_data_length_mismatch_error() {
    let pos = ByteOffset::new(20);
    // columns = 3, colors = 1 -> row_bytes = 3
    let params = PredictorParams::new(2, Some(1), None, Some(3), pos)
        .expect("valid parameters should construct");

    let data = [1, 2, 3, 4, 5]; // len = 5 (not multiple of 3)
    let err = decode_tiff_predictor(&data, &params, pos).unwrap_err();
    assert_eq!(
        err.kind,
        FlateErrorKind::PredictorDataLengthMismatch {
            expected_multiple_of: 3,
            actual: 5,
        }
    );
    assert_eq!(err.position, pos);
}

// TC-ERR-03: 未知の PNG フィルタタグエラー
#[test]
fn unknown_png_filter_tag_error() {
    let pos = ByteOffset::new(30);
    // columns = 2, colors = 1 -> row_bytes = 2, record_size = 3
    let params = PredictorParams::new(15, Some(1), None, Some(2), pos)
        .expect("valid parameters should construct");

    // Row 0 は正常タグ 0、Row 1 に不正タグ 7 を配置
    let data = [0, 10, 20, 7, 30, 40];
    let err = decode_png_predictor(&data, &params, pos).unwrap_err();
    assert_eq!(
        err.kind,
        FlateErrorKind::InvalidPngFilterTag { actual: 7, row: 1 }
    );
    assert_eq!(err.position, pos);
}

// TC-ERR-04: Predictor なし (1) の透過処理
#[test]
fn predictor_none_pass_through() {
    let pos = ByteOffset::new(40);
    let params =
        PredictorParams::new(1, None, None, None, pos).expect("valid parameters should construct");

    let data = [1, 2, 3, 4];
    let decoded = decode_predictor(&data, &params, pos).expect("pass-through should succeed");
    assert_eq!(decoded, vec![1, 2, 3, 4]);
}
