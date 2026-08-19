use super::{encrypt, encrypt_err};
use crate::encrypt::algorithm::StandardAlgorithm;
use crate::encrypt::crypt_filter::{
    AuthEvent, CryptFilterMethod, CryptFilterSelector, CryptFilters,
};
use crate::encrypt::error::EncryptErrorKind;
use crate::encrypt::key::{CryptFilterKey, EncryptKey, EncryptKeyPath};
use crate::encrypt::EncryptDictionary;
use crate::object::name::PdfName;

/// 標準ハンドラの必須キー（`/O` `/U` `/P`）。crypt filter の検証には関与しない。
const REQUIRED_KEYS: &str =
    "/O (0123456789abcdef0123456789abcdef) /U (0123456789abcdef0123456789abcdef) /P -1";

/// `/V 4` `/R 4` の暗号化辞書のソース文字列を組み立てる。
fn source(crypt_filter_keys: &str) -> Vec<u8> {
    format!("<< /Filter /Standard /V 4 /R 4 {crypt_filter_keys} {REQUIRED_KEYS} >>").into_bytes()
}

/// `/V 4` `/R 4` の crypt filter を取り出す。
fn crypt_filters(crypt_filter_keys: &str) -> CryptFilters {
    let EncryptDictionary::Standard(handler) = encrypt(&source(crypt_filter_keys)) else {
        panic!("expected the standard security handler");
    };
    let StandardAlgorithm::V4R4 { crypt_filters, .. } = handler.algorithm() else {
        panic!("expected the /V 4 /R 4 combination");
    };
    crypt_filters.clone()
}

// 典型的な AES-128 の /CF /StmF /StrF が型として取り出せることを確認する
#[test]
fn aes_128_crypt_filter_is_resolved_from_stream_and_string_selectors() {
    let filters =
        crypt_filters("/CF << /StdCF << /CFM /AESV2 /Length 16 >> >> /StmF /StdCF /StrF /StdCF");

    assert_eq!(
        filters.stream(),
        &CryptFilterSelector::Named(PdfName::from("StdCF"))
    );
    assert_eq!(filters.string(), filters.stream());
    assert_eq!(filters.len(), 1);
    assert!(!filters.is_empty());

    let filter = filters
        .get(filters.stream())
        .expect("/StmF should point at a defined crypt filter");
    assert_eq!(filter.method(), CryptFilterMethod::AesV2);
    assert_eq!(filter.length(), Some(16));
    assert_eq!(filter.auth_event(), AuthEvent::DocOpen);
}

// /CFM の各値が対応する暗号方式になることを確認する
#[test]
fn each_crypt_filter_method_is_mapped() {
    let cases: [(&str, CryptFilterMethod); 4] = [
        ("/None", CryptFilterMethod::None),
        ("/V2", CryptFilterMethod::V2),
        ("/AESV2", CryptFilterMethod::AesV2),
        ("/AESV3", CryptFilterMethod::AesV3),
    ];
    for (method, expected) in cases {
        let filters = crypt_filters(&format!(
            "/CF << /StdCF << /CFM {method} >> >> /StmF /StdCF /StrF /StdCF"
        ));

        let filter = filters
            .get(filters.stream())
            .expect("/StmF should point at a defined crypt filter");
        assert_eq!(filter.method(), expected, "/CFM {method}");
    }
}

// /CFM を省略した /CF エントリが既定の /None になることを確認する
#[test]
fn crypt_filter_without_method_defaults_to_none() {
    let filters = crypt_filters("/CF << /StdCF << /Length 16 >> >> /StmF /StdCF /StrF /StdCF");

    let filter = filters
        .get(filters.stream())
        .expect("/StmF should point at a defined crypt filter");
    assert_eq!(filter.method(), CryptFilterMethod::None);
}

// /AuthEvent /EFOpen が保持されることを確認する
#[test]
fn crypt_filter_keeps_embedded_file_auth_event() {
    let filters = crypt_filters(
        "/CF << /StdCF << /CFM /AESV2 /AuthEvent /EFOpen >> >> /StmF /StdCF /StrF /StdCF",
    );

    let filter = filters
        .get(filters.stream())
        .expect("/StmF should point at a defined crypt filter");
    assert_eq!(filter.auth_event(), AuthEvent::EFOpen);
}

// /EFF が埋め込みファイル用の指定として保持されることを確認する
#[test]
fn embedded_file_selector_is_kept() {
    let filters =
        crypt_filters("/CF << /StdCF << /CFM /AESV2 >> >> /StmF /StdCF /StrF /StdCF /EFF /StdCF");

    assert_eq!(
        filters.embedded_file(),
        Some(&CryptFilterSelector::Named(PdfName::from("StdCF")))
    );
}

// /StmF /StrF /EFF を省略したときに既定値が適用されることを確認する
#[test]
fn omitted_selectors_default_to_identity() {
    let filters = crypt_filters("/CF << /StdCF << /CFM /AESV2 >> >>");

    assert_eq!(filters.stream(), &CryptFilterSelector::Identity);
    assert_eq!(filters.string(), &CryptFilterSelector::Identity);
    assert_eq!(filters.embedded_file(), None);
    assert_eq!(filters.get(filters.stream()), None);
}

// 明示された /Identity が /CF 未定義エラーにならないことを確認する
#[test]
fn explicit_identity_selector_is_not_treated_as_undefined() {
    let filters = crypt_filters("/CF << /StdCF << /CFM /AESV2 >> >> /StmF /Identity /StrF /StdCF");

    assert_eq!(filters.stream(), &CryptFilterSelector::Identity);
}

// /V 4 で /CF が無い場合に MissingCryptFilters になることを確認する
#[test]
fn missing_crypt_filter_dictionary_is_rejected() {
    let error = encrypt_err(&source("/StmF /StdCF"));

    assert_eq!(error.kind(), &EncryptErrorKind::MissingCryptFilters);
}

// /CF に定義されていない名前を指す指定が UndefinedCryptFilter になることを確認する
#[test]
fn selector_pointing_at_undefined_filter_is_rejected() {
    let cases: [(&str, EncryptKey); 3] = [
        ("/StmF /NoSuchFilter", EncryptKey::StmF),
        ("/StrF /NoSuchFilter", EncryptKey::StrF),
        ("/EFF /NoSuchFilter", EncryptKey::EFF),
    ];
    for (selector, key) in cases {
        let error = encrypt_err(&source(&format!(
            "/CF << /StdCF << /CFM /AESV2 >> >> {selector}"
        )));

        assert_eq!(
            error.kind(),
            &EncryptErrorKind::UndefinedCryptFilter {
                key,
                name: PdfName::from("NoSuchFilter"),
            },
            "selector: {selector}"
        );
    }
}

// 未知の /CFM が UnknownCryptFilterMethod になることを確認する
#[test]
fn unknown_crypt_filter_method_is_rejected() {
    let error = encrypt_err(&source("/CF << /StdCF << /CFM /AESV9 >> >>"));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::UnknownCryptFilterMethod {
            name: PdfName::from("AESV9"),
        }
    );
}

// /CF が辞書でない場合に InvalidKeyType になることを確認する
#[test]
fn non_dictionary_crypt_filters_are_rejected() {
    let error = encrypt_err(&source("/CF [ /StdCF ]"));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::Root(EncryptKey::CF),
            actual_kind: "Array",
        }
    );
}

// /CF のエントリが辞書でない場合に、壊れているエントリ名がエラーに載ることを確認する
#[test]
fn non_dictionary_crypt_filter_entry_reports_its_name() {
    let error = encrypt_err(&source("/CF << /StdCF [ 1 2 ] >>"));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::CryptFilterEntry {
                name: PdfName::from("StdCF"),
            },
            actual_kind: "Array",
        }
    );
}

// /CF エントリ内の /CFM が名前でない場合に、エントリ名と /CFM がエラーに載ることを確認する
#[test]
fn non_name_crypt_filter_method_reports_its_entry_and_key() {
    let error = encrypt_err(&source("/CF << /StdCF << /CFM 1 >> >>"));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::CryptFilter {
                name: PdfName::from("StdCF"),
                key: CryptFilterKey::CFM,
            },
            actual_kind: "Integer",
        }
    );
}

// /CF に複数エントリがあるとき、壊れているエントリの名前が報告されることを確認する
#[test]
fn broken_entry_among_several_is_identified_by_name() {
    let error = encrypt_err(&source(
        "/CF << /AaaCF << /CFM /AESV2 >> /BbbCF << /CFM 1 >> >>",
    ));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::CryptFilter {
                name: PdfName::from("BbbCF"),
                key: CryptFilterKey::CFM,
            },
            actual_kind: "Integer",
        }
    );
}

// /CF 自体が非辞書のときと、エントリが非辞書のときがエラーの内容だけで区別できることを確認する
#[test]
fn non_dictionary_crypt_filters_and_entry_are_distinguishable() {
    let filters_error = encrypt_err(&source("/CF [ /StdCF ]"));
    let entry_error = encrypt_err(&source("/CF << /StdCF [ 1 2 ] >>"));

    assert_ne!(filters_error.kind(), entry_error.kind());
}

// /AuthEvent が名前でなくてもエラーにせず既定値になることを確認する
#[test]
fn non_name_auth_event_falls_back_to_doc_open() {
    let filters = crypt_filters("/CF << /StdCF << /CFM /AESV2 /AuthEvent 1 >> >> /StmF /StdCF");

    let filter = filters
        .get(filters.stream())
        .expect("/StmF should point at a defined crypt filter");
    assert_eq!(filter.auth_event(), AuthEvent::DocOpen);
}

// /Length が整数でなくてもエラーにせず None になることを確認する
#[test]
fn non_integer_crypt_filter_length_falls_back_to_none() {
    let filters = crypt_filters("/CF << /StdCF << /CFM /AESV2 /Length /Foo >> >> /StmF /StdCF");

    let filter = filters
        .get(filters.stream())
        .expect("/StmF should point at a defined crypt filter");
    assert_eq!(filter.length(), None);
}

// /StmF が名前でない場合に InvalidKeyType になることを確認する
#[test]
fn non_name_selector_is_rejected() {
    let error = encrypt_err(&source("/CF << /StdCF << /CFM /AESV2 >> >> /StmF 1"));

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKeyPath::Root(EncryptKey::StmF),
            actual_kind: "Integer",
        }
    );
}
