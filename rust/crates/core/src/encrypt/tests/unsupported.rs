use super::{encrypt, encrypt_err};
use crate::encrypt::error::EncryptErrorKind;
use crate::encrypt::key::EncryptKey;
use crate::encrypt::EncryptDictionary;
use crate::object::name::PdfName;
use crate::object::pdf_object::PdfObject;

// 公開鍵ハンドラの暗号化辞書が Unsupported になり、解析が失敗しないことを確認する
#[test]
fn public_key_handler_is_unsupported() {
    let encrypt = encrypt(b"<< /Filter /Adobe.PubSec /SubFilter /adbe.pkcs7.s4 >>");

    let EncryptDictionary::Unsupported { filter, raw } = encrypt else {
        panic!("expected an unsupported handler");
    };
    assert_eq!(filter, PdfName::from("Adobe.PubSec"));
    assert!(raw.contains_key(b"SubFilter".as_slice()));
}

// 独自ハンドラでも生の辞書が /Filter ごと無傷で残ることを確認する
#[test]
fn custom_handler_keeps_the_raw_dictionary() {
    let encrypt = encrypt(b"<< /Filter /Custom.Handler /CustomKey 12345 >>");

    assert!(encrypt.as_standard().is_none());
    let EncryptDictionary::Unsupported { filter, raw } = encrypt else {
        panic!("expected an unsupported handler");
    };
    assert_eq!(filter, PdfName::from("Custom.Handler"));
    assert_eq!(
        raw.get(b"CustomKey".as_slice()),
        Some(&PdfObject::Integer(12345))
    );
    assert_eq!(
        raw.get(b"Filter".as_slice()),
        Some(&PdfObject::Name(PdfName::from("Custom.Handler")))
    );
}

// 未文書化 (/V 0)・非公開 (/V 3) のアルゴリズムが Unsupported になることを確認する
#[test]
fn undocumented_and_unpublished_versions_are_unsupported() {
    let cases: [(i64, i64); 2] = [(0, 2), (3, 3)];
    for (version, revision) in cases {
        let source = format!("<< /Filter /Standard /V {version} /R {revision} >>").into_bytes();

        let encrypt = encrypt(&source);

        let EncryptDictionary::Unsupported { raw, .. } = &encrypt else {
            panic!("expected /V {version} /R {revision} to be unsupported");
        };
        assert!(raw.contains_key(b"V".as_slice()), "/V {version}");
        assert!(raw.contains_key(b"R".as_slice()), "/R {revision}");
    }
}

// 決定表にない /V × /R の組み合わせが Unsupported になることを確認する
#[test]
fn combinations_outside_the_decision_table_are_unsupported() {
    let cases: [(i64, i64); 4] = [(1, 6), (5, 4), (2, 2), (4, 3)];
    for (version, revision) in cases {
        let source = format!("<< /Filter /Standard /V {version} /R {revision} >>").into_bytes();

        let encrypt = encrypt(&source);

        assert!(
            matches!(encrypt, EncryptDictionary::Unsupported { .. }),
            "/V {version} /R {revision} should be unsupported"
        );
    }
}

// Unsupported に倒れた辞書では Standard 必須キーの検証をしないことを確認する
#[test]
fn unsupported_dictionary_skips_required_key_validation() {
    // /O /U /P を持たないが、未対応ハンドラ・未対応 /V のどちらの経路でも
    // 必須キーの検証には進まない。
    let cases: [&[u8]; 2] = [
        b"<< /Filter /Custom.Handler /V 5 /R 6 >>",
        b"<< /Filter /Standard /V 3 /R 3 >>",
    ];
    for source in cases {
        let encrypt = encrypt(source);

        assert!(
            matches!(encrypt, EncryptDictionary::Unsupported { .. }),
            "source: {}",
            String::from_utf8_lossy(source)
        );
    }
}

// /Filter が無い暗号化辞書が構造不正として拒否されることを確認する
#[test]
fn dictionary_without_filter_is_rejected() {
    let error = encrypt_err(b"<< /V 1 /R 2 >>");

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::MissingRequiredKey {
            key: EncryptKey::Filter
        }
    );
}

// /Filter が名前でない暗号化辞書が構造不正として拒否されることを確認する
#[test]
fn dictionary_with_non_name_filter_is_rejected() {
    let error = encrypt_err(b"<< /Filter 1 /V 1 /R 2 >>");

    assert_eq!(
        error.kind(),
        &EncryptErrorKind::InvalidKeyType {
            key: EncryptKey::Filter,
            actual_kind: "Integer",
        }
    );
}
