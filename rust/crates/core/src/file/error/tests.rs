use super::{FileError, FileErrorKind};
use crate::byte_offset::ByteOffset;

// new が渡した kind と position をそのまま保持することを確認する
#[test]
fn new_constructs_with_given_kind_and_position() {
    let position = ByteOffset::new(7);
    let error = FileError::new(FileErrorKind::SignatureNotFound, position);
    assert_eq!(error.kind, FileErrorKind::SignatureNotFound);
    assert_eq!(error.position, position);
}

// 各バリアント用コンストラクタが期待する kind を設定することを確認する
#[test]
fn convenience_constructors_set_expected_kind() {
    let position = ByteOffset::new(3);
    let cases: [(FileError, FileErrorKind); 9] = [
        (
            FileError::signature_not_found_at(position),
            FileErrorKind::SignatureNotFound,
        ),
        (
            FileError::unexpected_eof_at(position),
            FileErrorKind::UnexpectedEof,
        ),
        (
            FileError::unsupported_version_at(position, b"1.9".to_vec()),
            FileErrorKind::UnsupportedVersion {
                actual: b"1.9".to_vec(),
            },
        ),
        (
            FileError::eof_marker_not_found_at(position),
            FileErrorKind::EofMarkerNotFound,
        ),
        (
            FileError::start_xref_not_found_at(position),
            FileErrorKind::StartXrefNotFound,
        ),
        (
            FileError::offset_not_found_at(position),
            FileErrorKind::OffsetNotFound,
        ),
        (
            FileError::offset_overflow_at(position),
            FileErrorKind::OffsetOverflow,
        ),
        (
            FileError::unexpected_bytes_before_eof_marker_at(position),
            FileErrorKind::UnexpectedBytesBeforeEofMarker,
        ),
        (
            FileError::offset_out_of_file_at(position, 99, 25),
            FileErrorKind::OffsetOutOfFile {
                value: 99,
                file_len: 25,
            },
        ),
    ];
    for (error, expected_kind) in cases {
        assert_eq!(error.position, position, "kind: {expected_kind:?}");
        assert_eq!(error.kind, expected_kind, "kind: {expected_kind:?}");
    }
}

// 位置の境界値（0 と u64::MAX）が欠損なく保持されることを確認する
#[test]
fn position_boundary_values_are_preserved() {
    for raw in [0, u64::MAX] {
        let error = FileError::signature_not_found_at(ByteOffset::new(raw));
        assert_eq!(error.position, ByteOffset::new(raw), "raw: {raw}");
    }
}

// 等価性が kind と position の両方に従うことを確認する
#[test]
fn equality_follows_kind_and_position() {
    let position = ByteOffset::new(11);
    let base = FileError::offset_out_of_file_at(position, 99, 25);
    assert_eq!(base, FileError::offset_out_of_file_at(position, 99, 25));
    assert_ne!(base, FileError::offset_out_of_file_at(position, 98, 25));
    assert_ne!(base, FileError::offset_out_of_file_at(position, 99, 24));
    assert_ne!(
        base,
        FileError::offset_out_of_file_at(ByteOffset::new(12), 99, 25)
    );
    assert_ne!(base, FileError::offset_overflow_at(position));
}

// オフセット系の 4 バリアントが互いに区別されることを確認する
#[test]
fn offset_error_kinds_are_mutually_distinct() {
    let position = ByteOffset::new(0);
    let kinds = [
        FileError::offset_not_found_at(position).kind,
        FileError::offset_overflow_at(position).kind,
        FileError::unexpected_bytes_before_eof_marker_at(position).kind,
        FileError::offset_out_of_file_at(position, 1, 1).kind,
    ];
    for (index, left) in kinds.iter().enumerate() {
        for right in kinds.iter().skip(index + 1) {
            assert_ne!(left, right, "kinds must differ: {left:?} vs {right:?}");
        }
    }
}

// 非 UTF-8 の版表記が置換文字に潰れず生バイト列のまま保持されることを確認する
#[test]
fn unsupported_version_preserves_non_utf8_bytes() {
    let error = FileError::unsupported_version_at(ByteOffset::new(5), vec![0xFF, 0xFE]);
    assert_eq!(
        error.kind,
        FileErrorKind::UnsupportedVersion {
            actual: vec![0xFF, 0xFE],
        }
    );
}
