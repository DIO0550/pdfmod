use super::indirect;
use crate::encrypt::auth::tests::{parse_trailer, standard_handler, R4_CLEAR_METADATA, TRAILER};
use crate::encrypt::crypt_filter::CryptFilterMethod;
use crate::encrypt::error::EncryptErrorKind;
use crate::encrypt::key::EncryptKey;
use crate::encrypt::object_key::{
    EncryptedValueKind, ObjectDecryption, ObjectDecryptionTarget, ObjectKeyError,
};
use crate::encrypt::tests::encrypt_err;
use crate::object::name::PdfName;

#[test]
fn stream_and_string_filters_select_salted_aes128_and_unsalted_rc4() {
    let source = R4_CLEAR_METADATA
        .replace("/CF << /StdCF", "/CF << /Legacy << /CFM /V2 >> /StdCF")
        .replace("/StrF /StdCF", "/StrF /Legacy");
    let handler = standard_handler(source.as_bytes());
    let trailer = parse_trailer(TRAILER);
    let auth = handler.authenticate(Some(b"user"), trailer.id()).unwrap();

    let stream = indirect(7, 0x1234, EncryptedValueKind::Stream);
    let ObjectDecryption::Aes128(aes) = handler.object_decryption(&auth, stream).unwrap() else {
        panic!("/StmF の AESV2 が選ばれる");
    };
    let string = indirect(7, 0x1234, EncryptedValueKind::String);
    let ObjectDecryption::Rc4(rc4) = handler.object_decryption(&auth, string).unwrap() else {
        panic!("/StrF の V2 が選ばれる");
    };

    // 同じ ObjectId と既知の R4 ファイル鍵で、sAlT の有無だけを変えて hashlib で照合した。
    assert_eq!(
        aes.as_bytes(),
        b"\x1b\x66\xd7\xe5\xff\xda\x93\xe9\xbb\x90\x89\x2a\xb0\xe0\x50\x27"
    );
    assert_eq!(
        rc4.as_bytes(),
        b"\xa8\x1a\xbb\xe4\x02\x51\x16\xeb\xda\x01\xd9\x65\x26\x39\xdd\xee"
    );
}

#[test]
fn identity_and_no_encryption_method_return_no_key() {
    let trailer = parse_trailer(TRAILER);
    for selectors in [
        "/StrF /Identity /StmF /Identity",
        "",
        "/StrF /Clear /StmF /Default",
    ] {
        let source = R4_CLEAR_METADATA
            .replace("/StmF /StdCF /StrF /StdCF", selectors)
            .replace(
                "/CF << /StdCF",
                "/CF << /Clear << /CFM /None >> /Default << >> /StdCF",
            );
        let handler = standard_handler(source.as_bytes());
        let auth = handler.authenticate(Some(b"user"), trailer.id()).unwrap();

        for kind in [EncryptedValueKind::Stream, EncryptedValueKind::String] {
            let target = indirect(7, 0, kind);
            assert!(matches!(
                handler.object_decryption(&auth, target).unwrap(),
                ObjectDecryption::None
            ));
        }
    }
}

#[test]
fn undefined_stream_and_string_filter_fail_during_dictionary_parsing() {
    for (selector, key) in [("/StmF", EncryptKey::StmF), ("/StrF", EncryptKey::StrF)] {
        let source = R4_CLEAR_METADATA.replace(
            &format!("{selector} /StdCF"),
            &format!("{selector} /Unknown"),
        );
        assert_eq!(
            encrypt_err(source.as_bytes()).kind(),
            &EncryptErrorKind::UndefinedCryptFilter {
                key,
                name: PdfName::from("Unknown")
            },
        );
    }
}

#[test]
fn object_stream_container_gets_a_key_but_its_members_do_not() {
    let handler = standard_handler(R4_CLEAR_METADATA.as_bytes());
    let trailer = parse_trailer(TRAILER);
    let auth = handler.authenticate(Some(b"user"), trailer.id()).unwrap();

    let container = indirect(12, 0, EncryptedValueKind::Stream);
    assert!(matches!(
        handler.object_decryption(&auth, container).unwrap(),
        ObjectDecryption::Aes128(_)
    ));
    assert!(matches!(
        handler
            .object_decryption(&auth, ObjectDecryptionTarget::InObjectStream)
            .unwrap(),
        ObjectDecryption::None
    ));
}

#[test]
fn rejects_aes128_when_the_file_key_is_shorter_than_128_bits() {
    // R4 の 40 ビット鍵で /U の照合は通るが、AESV2 が要求する 128 ビットを満たさない。
    let source = b"<< /Filter /Standard /V 4 /R 4 /Length 40 /P -4
        /O <3c482162008fafcb228b7db3c43a1090bc5b56e9b1556e89fc0656fd291f4908>
        /U <d3b1553015c7d57ed4c8a35b0f084ee900000000000000000000000000000000>
        /CF << /StdCF << /CFM /AESV2 >> >> /StmF /StdCF >>";
    let handler = standard_handler(source);
    let trailer = parse_trailer(TRAILER);
    let auth = handler.authenticate(Some(b"user"), trailer.id()).unwrap();
    let target = indirect(7, 0, EncryptedValueKind::Stream);

    assert_eq!(
        handler.object_decryption(&auth, target).unwrap_err(),
        ObjectKeyError::IncompatibleFileKey {
            method: CryptFilterMethod::AesV2,
            length: 5,
        }
    );
}
