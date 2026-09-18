use super::*;

// new が渡した kind と position をそのまま保持することを確認する。
#[test]
fn new_keeps_kind_and_position() {
    let error = FlateError::new(FlateErrorKind::UnexpectedEof, ByteOffset::new(42));

    assert_eq!(error.kind, FlateErrorKind::UnexpectedEof);
    assert_eq!(error.position, ByteOffset::new(42));
}

// 引数を取らない xxx_at コンストラクタが、対応する kind と position を透過することを確認する。
#[test]
fn constructors_without_payload_pass_through_kind_and_position() {
    let position = ByteOffset::new(7);
    let cases: [(FlateError, FlateErrorKind); 5] = [
        (
            FlateError::unexpected_eof_at(position),
            FlateErrorKind::UnexpectedEof,
        ),
        (
            FlateError::preset_dictionary_unsupported_at(position),
            FlateErrorKind::PresetDictionaryUnsupported,
        ),
        (
            FlateError::oversubscribed_huffman_at(position),
            FlateErrorKind::OversubscribedHuffman,
        ),
        (
            FlateError::invalid_huffman_code_at(position),
            FlateErrorKind::InvalidHuffmanCode,
        ),
        (
            FlateError::invalid_code_length_repeat_at(position),
            FlateErrorKind::InvalidCodeLengthRepeat,
        ),
    ];

    for (error, expected) in cases {
        assert_eq!(error.kind, expected, "kind should be {expected:?}");
        assert_eq!(error.position, position, "position should pass through");
    }
}

// 付随情報を持つ xxx_at コンストラクタが、実値と position を透過することを確認する。
#[test]
fn constructors_with_payload_pass_through_values_and_position() {
    let position = ByteOffset::new(13);
    let cases: [(FlateError, FlateErrorKind); 10] = [
        (
            FlateError::unsupported_compression_method_at(position, 7),
            FlateErrorKind::UnsupportedCompressionMethod { actual: 7 },
        ),
        (
            FlateError::window_too_large_at(position, 8),
            FlateErrorKind::WindowTooLarge { actual: 8 },
        ),
        (
            FlateError::invalid_header_check_at(position, 0x7802),
            FlateErrorKind::InvalidHeaderCheck { actual: 0x7802 },
        ),
        (
            FlateError::reserved_block_type_at(position, 3),
            FlateErrorKind::ReservedBlockType { actual: 3 },
        ),
        (
            FlateError::stored_length_mismatch_at(position, 3, 0),
            FlateErrorKind::StoredLengthMismatch { len: 3, nlen: 0 },
        ),
        (
            FlateError::invalid_code_length_at(position, 16),
            FlateErrorKind::InvalidCodeLength { actual: 16 },
        ),
        (
            FlateError::invalid_code_length_symbol_at(position, 19),
            FlateErrorKind::InvalidCodeLengthSymbol { actual: 19 },
        ),
        (
            FlateError::invalid_length_symbol_at(position, 286),
            FlateErrorKind::InvalidLengthSymbol { actual: 286 },
        ),
        (
            FlateError::invalid_distance_symbol_at(position, 30),
            FlateErrorKind::InvalidDistanceSymbol { actual: 30 },
        ),
        (
            FlateError::distance_too_far_at(position, 5, 2),
            FlateErrorKind::DistanceTooFar {
                distance: 5,
                available: 2,
            },
        ),
    ];

    for (error, expected) in cases {
        assert_eq!(error.kind, expected, "kind should be {expected:?}");
        assert_eq!(error.position, position, "position should pass through");
    }
}

// checksum_mismatch_at が期待値と実測値を区別して保持することを確認する。
#[test]
fn checksum_mismatch_keeps_expected_and_actual_apart() {
    let error = FlateError::checksum_mismatch_at(ByteOffset::new(10), 1, 2);

    assert_eq!(
        error.kind,
        FlateErrorKind::ChecksumMismatch {
            expected: 1,
            actual: 2,
        }
    );
}

// 位置の下端（0）と上端（u64::MAX）がそのまま保持されることを確認する。
#[test]
fn boundary_positions_are_preserved() {
    for value in [0, u64::MAX] {
        let position = ByteOffset::new(value);
        let error = FlateError::unexpected_eof_at(position);

        assert_eq!(error.position, position, "position {value} should be kept");
    }
}

// Predictor 関連の引数なしコンストラクタが kind と position を透過することを確認する。
#[test]
fn predictor_constructors_without_payload_pass_through_kind_and_position() {
    let position = ByteOffset::new(42);
    let error = FlateError::predictor_parameter_overflow_at(position);
    assert_eq!(error.kind, FlateErrorKind::PredictorParameterOverflow);
    assert_eq!(error.position, position);
}

// Predictor 関連の付随情報を持つコンストラクタが、実値と position を透過することを確認する。
#[test]
fn predictor_constructors_with_payload_pass_through_values_and_position() {
    use crate::object::object_kind::ObjectKind;

    let position = ByteOffset::new(99);

    let cases: [(FlateError, FlateErrorKind); 7] = [
        (
            FlateError::unsupported_predictor_at(position, 16),
            FlateErrorKind::UnsupportedPredictor { actual: 16 },
        ),
        (
            FlateError::unsupported_bits_per_component_at(position, 16),
            FlateErrorKind::UnsupportedBitsPerComponent { actual: 16 },
        ),
        (
            FlateError::invalid_predictor_colors_at(position, 0),
            FlateErrorKind::InvalidPredictorColors { actual: 0 },
        ),
        (
            FlateError::invalid_predictor_columns_at(position, -1),
            FlateErrorKind::InvalidPredictorColumns { actual: -1 },
        ),
        (
            FlateError::invalid_decode_parms_key_type_at(position, "Predictor", ObjectKind::String),
            FlateErrorKind::InvalidDecodeParmsKeyType {
                key: "Predictor",
                actual: ObjectKind::String,
            },
        ),
        (
            FlateError::predictor_data_length_mismatch_at(position, 5, 12),
            FlateErrorKind::PredictorDataLengthMismatch {
                expected_multiple_of: 5,
                actual: 12,
            },
        ),
        (
            FlateError::invalid_png_filter_tag_at(position, 5, 2),
            FlateErrorKind::InvalidPngFilterTag { actual: 5, row: 2 },
        ),
    ];

    for (error, expected) in cases {
        assert_eq!(error.kind, expected, "kind should be {expected:?}");
        assert_eq!(error.position, position, "position should pass through");
    }
}
