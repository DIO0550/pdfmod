use crate::byte_offset::ByteOffset;
use crate::filter::error::FlateErrorKind;
use crate::filter::predictor::{
    BitsPerComponent, Colors, Columns, DecodeParmsKey, PngFilterTag, PredictorAlgorithm,
    PredictorParams, RecordSize, RowBytes, RowIndex,
};
use crate::object::dictionary::PdfDictionary;
use crate::object::name::PdfName;
use crate::object::object_kind::ObjectKind;
use crate::object::pdf_object::PdfObject;

// TC-PARAM-01: デフォルトパラメータの構築とアクセサ
#[test]
fn default_parameters_and_accessors() {
    let default = PredictorParams::default();
    assert_eq!(default.algorithm(), PredictorAlgorithm::None);
    assert_eq!(default.predictor(), 1);
    assert_eq!(default.colors(), Colors::one());
    assert_eq!(default.bits_per_component(), BitsPerComponent::Eight);
    assert_eq!(default.columns(), Columns::one());
    assert_eq!(default.row_bytes().as_usize(), 1);

    let empty_dict = PdfDictionary::new();
    let from_dict = PredictorParams::from_dictionary(&empty_dict, ByteOffset::new(0))
        .expect("empty dictionary should parse with default values");
    assert_eq!(from_dict, default);
}

// TC-PARAM-02: 辞書からの正常パラメータ抽出
#[test]
fn from_dictionary_normal_parameters() {
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::new(b"Predictor"), PdfObject::from(12));
    dict.insert(PdfName::new(b"Columns"), PdfObject::from(4));
    dict.insert(PdfName::new(b"Colors"), PdfObject::from(1));

    let params = PredictorParams::from_dictionary(&dict, ByteOffset::new(10))
        .expect("dictionary should parse");
    assert_eq!(params.algorithm(), PredictorAlgorithm::PngUp);
    assert_eq!(params.columns().get().get(), 4);
    assert_eq!(params.colors().get().get(), 1);
    assert_eq!(params.row_bytes().as_usize(), 4);
}

// TC-PARAM-03: サポート外 Predictor 値のエラー
#[test]
fn unsupported_predictor_error() {
    let pos = ByteOffset::new(20);
    for unsupported in [0, 3, 4, 9, 16] {
        let err = PredictorParams::new(unsupported, None, None, None, pos).unwrap_err();
        assert_eq!(
            err.kind,
            FlateErrorKind::UnsupportedPredictor {
                actual: unsupported
            }
        );
        assert_eq!(err.position, pos);
    }
}

// TC-PARAM-04: 未対応 BitsPerComponent のエラー
#[test]
fn unsupported_bits_per_component_error() {
    let pos = ByteOffset::new(30);
    for unsupported in [1, 2, 4, 16] {
        let err = PredictorParams::new(10, None, Some(unsupported), None, pos).unwrap_err();
        assert_eq!(
            err.kind,
            FlateErrorKind::UnsupportedBitsPerComponent {
                actual: unsupported
            }
        );
        assert_eq!(err.position, pos);
    }
}

// TC-PARAM-05: 不正な Colors / Columns の拒否
#[test]
fn invalid_colors_and_columns_error() {
    let pos = ByteOffset::new(40);
    for invalid in [0, -1, -99] {
        let err_colors = PredictorParams::new(10, Some(invalid), None, None, pos).unwrap_err();
        assert_eq!(
            err_colors.kind,
            FlateErrorKind::InvalidPredictorColors { actual: invalid }
        );
        assert_eq!(err_colors.position, pos);

        let err_columns = PredictorParams::new(10, None, None, Some(invalid), pos).unwrap_err();
        assert_eq!(
            err_columns.kind,
            FlateErrorKind::InvalidPredictorColumns { actual: invalid }
        );
        assert_eq!(err_columns.position, pos);
    }
}

// TC-PARAM-06: 辞書エントリの型不正エラー
#[test]
fn dictionary_entry_invalid_type_error() {
    let pos = ByteOffset::new(50);
    let mut dict = PdfDictionary::new();
    dict.insert(
        PdfName::new(b"Predictor"),
        PdfObject::Name(PdfName::new(b"PngUp")),
    );

    let err = PredictorParams::from_dictionary(&dict, pos).unwrap_err();
    assert_eq!(
        err.kind,
        FlateErrorKind::InvalidDecodeParmsKeyType {
            key: "Predictor",
            actual: ObjectKind::Name,
        }
    );
    assert_eq!(err.position, pos);
}

// TC-PARAM-07: Colors * Columns 乗算オーバーフローの拒否
#[test]
fn multiplication_overflow_error() {
    let pos = ByteOffset::new(60);
    let err = PredictorParams::new(10, Some(i64::MAX), None, Some(3), pos).unwrap_err();
    assert_eq!(err.kind, FlateErrorKind::PredictorParameterOverflow);
    assert_eq!(err.position, pos);
}

// TC-PARAM-08: Colors / Columns / RowBytes / RecordSize newtype の 0 拒否と非ゼロ不変条件
#[test]
fn newtype_zero_rejection_and_invariants() {
    assert!(Colors::from_usize(0).is_none());
    assert!(Columns::from_usize(0).is_none());
    assert!(RowBytes::from_usize(0).is_none());
    assert!(RecordSize::from_usize(0).is_none());

    let c = Colors::from_usize(3).unwrap();
    assert_eq!(c.get().get(), 3);
    let col = Columns::from_usize(10).unwrap();
    assert_eq!(col.get().get(), 10);
    let rb = RowBytes::from_usize(30).unwrap();
    assert_eq!(rb.as_usize(), 30);
    let rs = RecordSize::from_usize(31).unwrap();
    assert_eq!(rs.as_usize(), 31);
}

// TC-PARAM-09: PngFilterTag / PredictorAlgorithm / DecodeParmsKey の型変換と網羅性
#[test]
fn type_conversions_and_exhaustiveness() {
    let pos = ByteOffset::new(70);
    let row = RowIndex::new(0);

    assert_eq!(
        PngFilterTag::from_u8(0, row, pos).unwrap(),
        PngFilterTag::None
    );
    assert_eq!(
        PngFilterTag::from_u8(1, row, pos).unwrap(),
        PngFilterTag::Sub
    );
    assert_eq!(
        PngFilterTag::from_u8(2, row, pos).unwrap(),
        PngFilterTag::Up
    );
    assert_eq!(
        PngFilterTag::from_u8(3, row, pos).unwrap(),
        PngFilterTag::Average
    );
    assert_eq!(
        PngFilterTag::from_u8(4, row, pos).unwrap(),
        PngFilterTag::Paeth
    );

    let err_tag = PngFilterTag::from_u8(5, row, pos).unwrap_err();
    assert_eq!(
        err_tag.kind,
        FlateErrorKind::InvalidPngFilterTag {
            actual: 5,
            row: row.get()
        }
    );

    assert_eq!(PredictorAlgorithm::PngUp.as_i64(), 12);
    assert_eq!(DecodeParmsKey::EarlyChange.as_str(), "EarlyChange");
    assert_eq!(DecodeParmsKey::EarlyChange.as_bytes(), b"EarlyChange");
}
