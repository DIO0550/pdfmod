use super::super::PdfVersion;

const VERSIONS: [(PdfVersion, &str); 9] = [
    (PdfVersion::V1_0, "1.0"),
    (PdfVersion::V1_1, "1.1"),
    (PdfVersion::V1_2, "1.2"),
    (PdfVersion::V1_3, "1.3"),
    (PdfVersion::V1_4, "1.4"),
    (PdfVersion::V1_5, "1.5"),
    (PdfVersion::V1_6, "1.6"),
    (PdfVersion::V1_7, "1.7"),
    (PdfVersion::V2_0, "2.0"),
];

#[test]
fn as_str_all_versions_returns_version_text() {
    // 9 バリアントすべてが対応する版表記を返すことを確認する
    for (version, expected) in VERSIONS {
        assert_eq!(version.as_str(), expected);
    }
}

#[test]
fn display_version_returns_undecorated_text() {
    // Display がシグネチャなどを付けず版表記だけを返すことを確認する
    assert_eq!(format!("{}", PdfVersion::V1_7), "1.7");
}

#[test]
fn display_width_specifier_is_preserved() {
    // Display の幅と右寄せ指定が内部文字列へ委譲されることを確認する
    assert_eq!(format!("{:>6}", PdfVersion::V1_7), "   1.7");
}

#[test]
fn as_str_then_from_bytes_roundtrips_all_versions() {
    // 9 バリアントを表記へ変換して再解析すると元の版へ戻ることを確認する
    for (version, _) in VERSIONS {
        assert_eq!(
            PdfVersion::from_bytes(version.as_str().as_bytes()),
            Some(version)
        );
    }
}
