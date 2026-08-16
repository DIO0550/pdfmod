use super::super::ParsedTrailer;
use super::simple_trailer;
use crate::byte_offset::ByteOffset;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::xref::trailer::error::TrailerErrorKind;
use crate::xref::trailer::key::TrailerKey;
use crate::xref::trailer::EncryptValue;

// /Encrypt が間接参照のときに EncryptValue::Reference として正しく取り出せることを確認する
#[test]
fn encrypt_as_reference_is_extracted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Encrypt 9 0 R");
    let parsed =
        ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("/Encrypt reference should parse");
    match parsed.trailer().encrypt() {
        Some(EncryptValue::Reference(r)) => {
            assert_eq!(
                r.target(),
                ObjectId::new(ObjectNumber::new(9), GenerationNumber::new(0))
            );
        }
        other => panic!("expected EncryptValue::Reference, got {other:?}"),
    }
}

// /Encrypt が直接辞書のときに EncryptValue::Dictionary として正しく取り出せることを確認する
#[test]
fn encrypt_as_dictionary_is_extracted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Encrypt << /Filter /Standard /V 2 >>");
    let parsed =
        ParsedTrailer::parse(&input, ByteOffset::new(0)).expect("/Encrypt dictionary should parse");
    match parsed.trailer().encrypt() {
        Some(EncryptValue::Dictionary(dict)) => {
            let filter = dict
                .get(b"Filter".as_slice())
                .expect("/Filter should exist");
            assert_eq!(
                filter.as_name().map(|n| n.as_bytes()),
                Some(b"Standard".as_slice())
            );
            let v = dict.get(b"V".as_slice()).expect("/V should exist");
            assert_eq!(v.as_integer(), Some(2));
        }
        other => panic!("expected EncryptValue::Dictionary, got {other:?}"),
    }
}

// ネストした crypt filter を含む暗号化辞書がネスト構造ごと欠落なく保持されることを確認する
#[test]
fn encrypt_dictionary_with_nested_crypt_filters_is_preserved() {
    let input = simple_trailer(
        "/Size 6 /Root 1 0 R /Encrypt << /Filter /Standard /V 4 /R 4 /CF << /StdCF << /CFM /AESV2 /Length 16 >> >> /StrF /StdCF /StmF /StdCF >>",
    );
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("nested encrypt dictionary should parse");
    match parsed.trailer().encrypt() {
        Some(EncryptValue::Dictionary(dict)) => {
            let cf = dict.get(b"CF".as_slice()).expect("/CF should exist");
            let PdfObject::Dictionary(cf_dict) = cf else {
                panic!("expected /CF to be a Dictionary");
            };
            let std_cf = cf_dict
                .get(b"StdCF".as_slice())
                .expect("/StdCF should exist");
            let PdfObject::Dictionary(std_cf_dict) = std_cf else {
                panic!("expected /StdCF to be a Dictionary");
            };
            assert_eq!(
                std_cf_dict
                    .get(b"CFM".as_slice())
                    .and_then(|o| o.as_name())
                    .map(|n| n.as_bytes()),
                Some(b"AESV2".as_slice())
            );
            assert_eq!(
                std_cf_dict
                    .get(b"Length".as_slice())
                    .and_then(|o| o.as_integer()),
                Some(16)
            );
        }
        other => panic!("expected EncryptValue::Dictionary, got {other:?}"),
    }
}

// 未知の独自セキュリティハンドラを含む暗号化辞書がエラーにならず保持されることを確認する
#[test]
fn encrypt_dictionary_with_unknown_handler_is_preserved() {
    let input = simple_trailer(
        "/Size 6 /Root 1 0 R /Encrypt << /Filter /Custom.Handler /CustomKey 12345 >>",
    );
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("unknown handler encrypt dictionary should parse");
    match parsed.trailer().encrypt() {
        Some(EncryptValue::Dictionary(dict)) => {
            assert!(dict.get(b"Filter".as_slice()).is_some());
            assert_eq!(
                dict.get(b"CustomKey".as_slice())
                    .and_then(|o| o.as_integer()),
                Some(12345)
            );
        }
        other => panic!("expected EncryptValue::Dictionary, got {other:?}"),
    }
}

// /Encrypt が空の辞書であっても受理されることを確認する
#[test]
fn encrypt_as_empty_dictionary_is_accepted() {
    let input = simple_trailer("/Size 6 /Root 1 0 R /Encrypt << >>");
    let parsed = ParsedTrailer::parse(&input, ByteOffset::new(0))
        .expect("empty encrypt dictionary should parse");
    assert!(matches!(
        parsed.trailer().encrypt(),
        Some(EncryptValue::Dictionary(_))
    ));
}

// /Encrypt が間接参照でも辞書でもない場合に InvalidKeyType エラーになることを確認する
#[test]
fn encrypt_with_wrong_type_is_rejected() {
    let cases: [(&str, &'static str); 4] = [
        ("/Size 6 /Root 1 0 R /Encrypt 42", "Integer"),
        ("/Size 6 /Root 1 0 R /Encrypt /Standard", "Name"),
        ("/Size 6 /Root 1 0 R /Encrypt (encrypt)", "String"),
        ("/Size 6 /Root 1 0 R /Encrypt [9 0 R]", "Array"),
    ];
    for (body, expected_kind) in cases {
        let input = simple_trailer(body);
        let error = ParsedTrailer::parse(&input, ByteOffset::new(0))
            .expect_err("invalid /Encrypt should be rejected");
        assert_eq!(
            error.kind,
            TrailerErrorKind::InvalidKeyType {
                key: TrailerKey::Encrypt,
                actual_kind: expected_kind,
            },
            "body: {body}"
        );
    }
}
