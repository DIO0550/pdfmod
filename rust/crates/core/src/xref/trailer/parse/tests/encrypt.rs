use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;
use crate::encrypt::algorithm::StandardAlgorithm;
use crate::encrypt::crypt_filter::CryptFilterMethod;
use crate::encrypt::error::EncryptErrorKind;
use crate::encrypt::key::EncryptKey;
use crate::encrypt::EncryptDictionary;
use crate::object::generation_number::GenerationNumber;
use crate::object::name::PdfName;
use crate::object::object_id::ObjectId;
use crate::object::object_kind::ObjectKind;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::xref::trailer::error::{TrailerError, TrailerErrorKind};
use crate::xref::trailer::key::TrailerKey;
use crate::xref::trailer::{EncryptValue, Trailer};

/// `/O` `/U` `/P` を含む標準ハンドラの必須キー。
const REQUIRED_ENCRYPT_KEYS: &str =
    "/O (0123456789abcdef0123456789abcdef) /U (0123456789abcdef0123456789abcdef) /P -3904";

/// トレイラ本体をパースして `Trailer` を得る（成功を期待する）。
fn trailer(body: &str) -> Trailer {
    let input = simple_trailer(body);
    ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("trailer should parse")
        .trailer()
        .clone()
}

/// トレイラ本体をパースしてエラーを得る（失敗を期待する）。
fn trailer_err(body: &str) -> TrailerError {
    let input = simple_trailer(body);
    ParsedTrailer::parse(&input, ByteOffset::new(0)).expect_err("trailer should be rejected")
}

// /Encrypt が間接参照のときに EncryptValue::Reference として正しく取り出せることを確認する
#[test]
fn encrypt_as_reference_is_extracted() {
    let trailer = trailer("/Size 6 /Root 1 0 R /Encrypt 9 0 R");

    match trailer.encrypt() {
        Some(EncryptValue::Reference(r)) => {
            assert_eq!(
                r.target(),
                ObjectId::new(ObjectNumber::new(9), GenerationNumber::new(0))
            );
        }
        other => panic!("expected EncryptValue::Reference, got {other:?}"),
    }
}

// /Encrypt が直接辞書のときに型付きの標準ハンドラとして取り出せることを確認する
#[test]
fn encrypt_as_dictionary_is_typed_as_standard_handler() {
    let trailer = trailer(&format!(
        "/Size 6 /Root 1 0 R /Encrypt << /Filter /Standard /V 1 /R 2 {REQUIRED_ENCRYPT_KEYS} >>"
    ));

    let Some(EncryptValue::Dictionary(encrypt)) = trailer.encrypt() else {
        panic!("expected a direct encryption dictionary");
    };
    let handler = encrypt
        .as_standard()
        .expect("/Filter /Standard should be typed as the standard handler");
    assert_eq!(handler.algorithm(), &StandardAlgorithm::V1R2);
    assert_eq!(handler.permissions().bits(), -3904);
    // 他の必須キーが従来どおり取り出せることも確認する。
    assert_eq!(trailer.size(), 6);
}

// ネストした crypt filter が型として解釈されることを確認する
#[test]
fn encrypt_dictionary_with_nested_crypt_filters_is_typed() {
    let trailer = trailer(&format!(
        "/Size 6 /Root 1 0 R /Encrypt << /Filter /Standard /V 4 /R 4 \
         /CF << /StdCF << /CFM /AESV2 /Length 16 >> >> /StrF /StdCF /StmF /StdCF \
         {REQUIRED_ENCRYPT_KEYS} >>"
    ));

    let Some(EncryptValue::Dictionary(encrypt)) = trailer.encrypt() else {
        panic!("expected a direct encryption dictionary");
    };
    let handler = encrypt
        .as_standard()
        .expect("/Filter /Standard should be typed as the standard handler");
    let StandardAlgorithm::V4R4 { crypt_filters, .. } = handler.algorithm() else {
        panic!("expected the /V 4 /R 4 combination");
    };
    let filter = crypt_filters
        .get(crypt_filters.stream())
        .expect("/StmF should point at a defined crypt filter");
    assert_eq!(filter.method(), CryptFilterMethod::AesV2);
    assert_eq!(filter.length(), Some(16));
    assert_eq!(crypt_filters.string(), crypt_filters.stream());
}

// 未知の独自セキュリティハンドラでも解析が成功し、生の辞書が保持されることを確認する
#[test]
fn encrypt_dictionary_with_unknown_handler_is_preserved() {
    let trailer =
        trailer("/Size 6 /Root 1 0 R /Encrypt << /Filter /Custom.Handler /CustomKey 12345 >>");

    let Some(EncryptValue::Dictionary(EncryptDictionary::Unsupported { filter, raw })) =
        trailer.encrypt()
    else {
        panic!("expected an unsupported encryption dictionary");
    };
    assert_eq!(filter, &PdfName::from("Custom.Handler"));
    assert_eq!(
        raw.get(b"CustomKey".as_slice()),
        Some(&PdfObject::Integer(12345))
    );
    // /Filter も含め、元の辞書が無傷で残っている。
    assert!(raw.contains_key(b"Filter".as_slice()));
}

// 空の暗号化辞書は /Filter を持たないため構造不正として拒否されることを確認する
#[test]
fn empty_encrypt_dictionary_is_rejected() {
    let error = trailer_err("/Size 6 /Root 1 0 R /Encrypt << >>");

    assert_eq!(
        error.kind,
        TrailerErrorKind::EncryptDictionaryInvalid {
            kind: EncryptErrorKind::MissingRequiredKey {
                key: EncryptKey::Filter,
            },
        }
    );
}

// /Encrypt が間接参照でも辞書でもない場合に InvalidKeyType エラーになることを確認する
#[test]
fn encrypt_with_wrong_type_is_rejected() {
    let cases: [(&str, ObjectKind); 4] = [
        ("/Size 6 /Root 1 0 R /Encrypt 42", ObjectKind::Integer),
        ("/Size 6 /Root 1 0 R /Encrypt /Standard", ObjectKind::Name),
        ("/Size 6 /Root 1 0 R /Encrypt (encrypt)", ObjectKind::String),
        ("/Size 6 /Root 1 0 R /Encrypt [9 0 R]", ObjectKind::Array),
    ];
    for (body, expected_kind) in cases {
        let error = trailer_err(body);

        assert_eq!(
            error.kind,
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Encrypt,
                actual: expected_kind,
            },
            "body: {body}"
        );
    }
}
