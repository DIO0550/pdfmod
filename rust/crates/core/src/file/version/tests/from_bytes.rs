use super::super::PdfVersion;

const VERSIONS: [(&[u8], PdfVersion); 9] = [
    (b"1.0", PdfVersion::V1_0),
    (b"1.1", PdfVersion::V1_1),
    (b"1.2", PdfVersion::V1_2),
    (b"1.3", PdfVersion::V1_3),
    (b"1.4", PdfVersion::V1_4),
    (b"1.5", PdfVersion::V1_5),
    (b"1.6", PdfVersion::V1_6),
    (b"1.7", PdfVersion::V1_7),
    (b"2.0", PdfVersion::V2_0),
];

#[test]
fn from_bytes_pdf_1_7_returns_v1_7() {
    // 一般的な 1.7 の表記が V1_7 に解決されることを確認する
    assert_eq!(PdfVersion::from_bytes(b"1.7"), Some(PdfVersion::V1_7));
}

#[test]
fn from_bytes_supported_versions_returns_corresponding_variants() {
    // ISO が規定する 9 版すべてが対応するバリアントに解決されることを確認する
    for (bytes, expected) in VERSIONS {
        assert_eq!(PdfVersion::from_bytes(bytes), Some(expected));
    }
}

#[test]
fn from_bytes_allowlist_boundaries_returns_variants() {
    // allowlist の最古版と最新版がともに受理されることを確認する
    assert_eq!(PdfVersion::from_bytes(b"1.0"), Some(PdfVersion::V1_0));
    assert_eq!(PdfVersion::from_bytes(b"2.0"), Some(PdfVersion::V2_0));
}

#[test]
fn from_bytes_unsupported_versions_returns_none() {
    // ISO 未規定の版がいずれも拒否されることを確認する
    for bytes in [b"1.8".as_slice(), b"3.0", b"0.9"] {
        assert_eq!(PdfVersion::from_bytes(bytes), None);
    }
}

#[test]
fn from_bytes_malformed_versions_returns_none() {
    // 形式が壊れた版表記がいずれも拒否されることを確認する
    for bytes in [b"17".as_slice(), b"1.", b".7", b"x.y"] {
        assert_eq!(PdfVersion::from_bytes(bytes), None);
    }
}

#[test]
fn from_bytes_empty_returns_none() {
    // 空バイト列が panic せず拒否されることを確認する
    assert_eq!(PdfVersion::from_bytes(b""), None);
}

#[test]
fn from_bytes_extra_characters_returns_none() {
    // 余分な桁や前後の空白を含む表記が完全一致として受理されないことを確認する
    for bytes in [b"1.70".as_slice(), b" 1.7", b"1.7 "] {
        assert_eq!(PdfVersion::from_bytes(bytes), None);
    }
}

#[test]
fn from_bytes_zero_padded_versions_returns_none() {
    // ゼロ埋めされた版表記が拒否されることを確認する
    for bytes in [b"01.7".as_slice(), b"1.07"] {
        assert_eq!(PdfVersion::from_bytes(bytes), None);
    }
}

#[test]
fn from_bytes_wrong_separators_returns_none() {
    // ピリオド以外の区切りを使った表記が拒否されることを確認する
    for bytes in [b"1,7".as_slice(), b"1-7", b"1_7"] {
        assert_eq!(PdfVersion::from_bytes(bytes), None);
    }
}

#[test]
fn from_bytes_full_width_version_returns_none() {
    // 全角の版表記が panic せず拒否されることを確認する
    assert_eq!(PdfVersion::from_bytes("１．７".as_bytes()), None);
}

#[test]
fn from_bytes_binary_bytes_returns_none() {
    // 制御バイトと非 UTF-8 バイト列が panic せず拒否されることを確認する
    for bytes in [b"\0\0\0".as_slice(), b"\xFF\xFE"] {
        assert_eq!(PdfVersion::from_bytes(bytes), None);
    }
}

#[test]
fn from_bytes_long_input_returns_none() {
    // 256 バイトの長大な入力が拒否されることを確認する
    let bytes = [b'1'; 256];
    assert_eq!(PdfVersion::from_bytes(&bytes), None);
}

#[test]
fn from_bytes_version_with_eol_returns_none() {
    // EOL を含む版表記が完全一致として受理されないことを確認する
    assert_eq!(PdfVersion::from_bytes(b"1.7\n"), None);
}
