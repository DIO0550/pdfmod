use super::*;
use crate::encrypt::standard::StandardSecurityHandler;
use crate::encrypt::EncryptDictionary;
use crate::object::pdf_object::PdfObject;
use crate::parser::Parser;
use crate::xref::trailer::file_id::FileId;

const R2: &str = "<< /Filter /Standard /V 1 /R 2 /Length 40 /P -4
    /O <c92422687facee686e373f10b5c7d04738053152f7e2ee30e11c69ec442576ab>
    /U <b3d9fa366906ef42f354c6deb74c59075eaf334eb7c04356ba0d7f3dd8b51d0a> >>";
pub(super) const R3_RC4_128: &str = "<< /Filter /Standard /V 2 /R 3 /Length 128 /P -4
    /O <4ee1d41e94737be19102bf7b4641e524b372b64683f2beaff9f83a4acd0dbaf9>
    /U <3af1a0bcf5545dc6dae3e61e4dbc40e10122456a91bae5134273a6db134c87c4> >>";
pub(super) const R3_PASSWORD: &[u8] = b"0123456789abcdefghijklmnopqrstuv";
const R4_IDENTITY: &str = "<< /Filter /Standard /V 4 /R 4 /Length 128
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >>
    /StmF /StdCF /StrF /Identity /P -3392 /EncryptMetadata false
    /O <0ba3835f88f90388e74e54584125ce142be0de24c6b0d37746e075b891756671>
    /U <3250600e32dc6a8eae7dc501b5ba8e520122456a91bae5134273a6db134c87c4> >>";
pub(super) const R4_AES: &str = "<< /Filter /Standard /V 4 /R 4 /Length 128
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV2 /Length 16 >> >>
    /StmF /StdCF /StrF /StdCF /P -3392 /EncryptMetadata false
    /O <0ba3835f88f90388e74e54584125ce142be0de24c6b0d37746e075b891756671>
    /U <3250600e32dc6a8eae7dc501b5ba8e520122456a91bae5134273a6db134c87c4> >>";
pub(super) const R5_AES_256: &str = "<< /Filter /Standard /V 5 /R 5 /Length 256 /P -2056 /EncryptMetadata false
    /CF << /StdCF << /AuthEvent /DocOpen /CFM /AESV3 /Length 32 >> >> /StmF /StdCF /StrF /StdCF
    /U <3916d3759dc2e10a5713cbd17c7f9c877e32aae8341dc9f7784bac7dfcc444ba926cf53fe6a56fc5241068d1711700af>
    /O <db08eb04752944359416b3fae79e6bda6f0fc1674a1816cde5112ecd2d6e5b260a29246108d326fecf659d0b1a349b71>
    /UE <1bb756cf4e964ac65b7c1430f5c04b4ceffdc61106b03427414234a0b25c949a>
    /OE <185bf096b62bbeca3b023d7d7b79aed578b5492687359f76bd668da0707ff883>
    /Perms <73af477cf207fda06ad72737763c4729> >>";
const R4_INCOMPATIBLE: &str = "<< /Filter /Standard /V 4 /R 4 /Length 40 /P -4
    /O <3c482162008fafcb228b7db3c43a1090bc5b56e9b1556e89fc0656fd291f4908>
    /U <d3b1553015c7d57ed4c8a35b0f084ee900000000000000000000000000000000>
    /CF << /StdCF << /CFM /AESV2 >> >> /StmF /StdCF >>";
pub(super) const FILE_ID: &str = "31415926535897932384626433832795";

pub(super) fn standard_handler(source: &str) -> StandardSecurityHandler {
    let PdfObject::Dictionary(dictionary) = Parser::new(source.as_bytes())
        .parse_object()
        .expect("暗号化辞書をパースできる")
    else {
        panic!("暗号化辞書は辞書オブジェクト");
    };
    let encrypt = EncryptDictionary::from_dictionary(dictionary, ByteOffset::new(0))
        .expect("暗号化辞書を構築できる");
    match encrypt {
        EncryptDictionary::Standard(handler) => handler,
        EncryptDictionary::Unsupported { .. } => panic!("標準ハンドラ"),
    }
}

fn r2_handler() -> StandardSecurityHandler {
    standard_handler(R2)
}

pub(super) fn file_id() -> FileId {
    let source = format!("[<{FILE_ID}> <{FILE_ID}>]");
    let PdfObject::Array(elements) = Parser::new(source.as_bytes())
        .parse_object()
        .expect("ファイルID配列をパースできる")
    else {
        panic!("ファイルIDは配列");
    };
    FileId::from_array(elements.into_vec()).expect("ファイルIDを構築できる")
}

#[test]
fn decrypts_rc4_string_through_authenticated_resolver() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(2, 0, "<c9cbd5553118>");
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("文字列を解決できる");

    assert_eq!(resolved.as_string_bytes(), Some(b"secret".as_slice()));
}

#[test]
fn decrypts_rc4_strings_nested_in_dictionary_and_array() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(
        2,
        0,
        "<< /Values [ <c9cbd5553118> << /Secret <c9cbd5553118> >> ] >>",
    );
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver.resolve(reference(2, 0)).expect("辞書を解決できる");
    let dictionary = resolved.as_dictionary().expect("辞書オブジェクト");
    let values = dictionary
        .get(b"Values".as_slice())
        .and_then(PdfObject::as_pdf_array)
        .expect("配列値");

    assert_eq!(
        values.get(0).and_then(PdfObject::as_string_bytes),
        Some(b"secret".as_slice())
    );
    assert_eq!(
        values
            .get(1)
            .and_then(PdfObject::as_dictionary)
            .and_then(|entry| entry.get(b"Secret".as_slice()))
            .and_then(PdfObject::as_string_bytes),
        Some(b"secret".as_slice())
    );
}

pub(super) fn binary_stream_object(pdf: &mut PdfFixture, number: u64, data: &[u8]) {
    binary_stream_object_with_dictionary(pdf, number, &format!("/Length {}", data.len()), data);
}

fn binary_stream_object_with_dictionary(
    pdf: &mut PdfFixture,
    number: u64,
    dictionary: &str,
    data: &[u8],
) {
    let offset = pdf.data.len();
    pdf.entries.push((number, offset, 0));
    pdf.data
        .extend_from_slice(format!("{number} 0 obj\n<< {dictionary} >>\nstream\n").as_bytes());
    pdf.data.extend_from_slice(data);
    pdf.data.extend_from_slice(b"\nendstream\nendobj\n");
}

#[test]
fn decrypts_rc4_stream_and_updates_length() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Contents 2 0 R >>");
    binary_stream_object(
        &mut pdf,
        2,
        &[
            0xc9, 0xda, 0xc4, 0x42, 0x35, 0x01, 0xa4, 0x01, 0xab, 0x24, 0xdf,
        ],
    );
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("ストリームを解決できる");
    let stream = resolved.as_stream().expect("ストリームオブジェクト");

    assert_eq!(stream.data(), b"stream data");
    assert_eq!(
        stream.dictionary().get(b"Length".as_slice()),
        Some(&PdfObject::from(11))
    );
}

#[test]
fn skips_encrypt_dictionary_and_trailer_id() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(3, 0, R2);
    let data =
        pdf.finish_with_trailer("", &format!("/Encrypt 3 0 R /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(3, 0))
        .expect("暗号化辞書を解決できる");
    let trailer_id = resolver
        .trailer()
        .and_then(crate::xref::trailer::Trailer::id)
        .expect("トレーラーID");

    assert!(resolved.as_dictionary().is_some());
    assert_eq!(trailer_id.permanent(), file_id.permanent());
}

#[test]
fn identity_string_filter_preserves_bytes() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(2, 0, "<736563726574>");
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R4_IDENTITY} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R4_IDENTITY);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(b"user"), Some(&file_id))
        .expect("R4 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("文字列を解決できる");

    assert_eq!(resolved.as_string_bytes(), Some(b"secret".as_slice()));
}

#[test]
fn type_xref_stream_is_not_decrypted() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    binary_stream_object_with_dictionary(&mut pdf, 2, "/Type /XRef /Length 4", b"xref");
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("xref streamを解決できる");

    assert_eq!(
        resolved.as_stream().expect("ストリームオブジェクト").data(),
        b"xref"
    );
}

#[test]
fn encrypt_metadata_false_preserves_metadata_stream_data() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    binary_stream_object_with_dictionary(&mut pdf, 2, "/Type /Metadata /Length 5", b"clear");
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R4_IDENTITY} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R4_IDENTITY);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(b"user"), Some(&file_id))
        .expect("R4 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("メタデータを解決できる");

    assert_eq!(
        resolved.as_stream().expect("ストリームオブジェクト").data(),
        b"clear"
    );
}

#[test]
fn object_stream_members_are_not_decrypted_twice() {
    let mut pdf = PdfFixture::new();
    let object_1 = pdf.object(1, 0, "<< /Value 2 0 R >>");
    let object_3 = binary_stream_object_with_dictionary_at(
        &mut pdf,
        3,
        "/Type /ObjStm /N 1 /First 4 /Length 12",
        &[
            0x97, 0x6c, 0x63, 0xb2, 0x52, 0xc1, 0xbe, 0xd7, 0x00, 0x63, 0x61, 0x47,
        ],
    );
    let xref_offset = pdf.data.len();
    let row_bytes = [
        (1, u32::try_from(object_1).expect("offset"), 0_u16),
        (2, 3, 0_u16),
        (1, u32::try_from(object_3).expect("offset"), 0_u16),
        (1, u32::try_from(xref_offset).expect("offset"), 0_u16),
    ];
    pdf.data.extend_from_slice(
        format!(
            "4 0 obj\n<< /Type /XRef /Size 5 /Root 1 0 R /W [1 4 2] /Index [1 3 4 1] /Length 28 /Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>] >>\nstream\n"
        )
        .as_bytes(),
    );
    for row in row_bytes {
        pdf.data.push(row.0);
        pdf.data.extend_from_slice(&row.1.to_be_bytes());
        pdf.data.extend_from_slice(&row.2.to_be_bytes());
    }
    pdf.data.extend_from_slice(
        format!("\nendstream\nendobj\nstartxref\n{xref_offset}\n%%EOF\n").as_bytes(),
    );
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&pdf.data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("ObjStm内オブジェクトを解決できる");

    assert_eq!(resolved.as_string_bytes(), Some(b"secret".as_slice()));
}

#[test]
fn unauthenticated_decryption_returns_dedicated_error() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(2, 0, "<c9cbd5553118>");
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");
    resolver.authentication = None;

    assert!(matches!(
        resolver.resolve(reference(2, 0)),
        Err(ResolveError::Unauthenticated)
    ));
}

#[test]
fn incompatible_crypt_filter_and_file_key_is_reported() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Contents 2 0 R >>");
    binary_stream_object(&mut pdf, 2, b"bad");
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R4_INCOMPATIBLE} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R4_INCOMPATIBLE);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(b"user"), Some(&file_id))
        .expect("R4 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    assert!(matches!(
        resolver.resolve(reference(2, 0)),
        Err(ResolveError::IncompatibleDecryption(
            crate::encrypt::object_key::ObjectKeyError::IncompatibleFileKey {
                method: crate::encrypt::crypt_filter::CryptFilterMethod::AesV2,
                length: 5,
            }
        ))
    ));
}

#[test]
fn invalid_aes_ciphertext_reports_decryption_error() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Contents 2 0 R >>");
    binary_stream_object(&mut pdf, 2, b"bad");
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R4_IDENTITY} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R4_IDENTITY);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(b"user"), Some(&file_id))
        .expect("R4 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    assert!(matches!(
        resolver.resolve(reference(2, 0)),
        Err(ResolveError::Decryption(
            crate::encrypt::object_key::DecryptError::InvalidLength
        ))
    ));
}

#[test]
fn caches_decrypted_object_for_repeated_resolution() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(2, 0, "<c9cbd5553118>");
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R2} /ID [<{FILE_ID}> <{FILE_ID}>]"));
    let handler = r2_handler();
    let file_id = file_id();
    let authentication = handler
        .authenticate(None, Some(&file_id))
        .expect("R2 の空利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let first = resolver.resolve(reference(2, 0)).expect("初回の解決");
    let second = resolver.resolve(reference(2, 0)).expect("キャッシュ解決");

    assert!(Rc::ptr_eq(&first, &second));
    assert_eq!(second.as_string_bytes(), Some(b"secret".as_slice()));
}

#[test]
fn decrypts_aes128_string() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R >>");
    pdf.object(
        2,
        0,
        "<000102030405060708090a0b0c0d0e0f0c64cc0b0ddbb002f1722b923e4d71fb>",
    );
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R4_AES} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R4_AES);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(b"user"), Some(&file_id))
        .expect("R4 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(2, 0))
        .expect("AES文字列を解決できる");

    assert_eq!(resolved.as_string_bytes(), Some(b"secret".as_slice()));
}

#[test]
fn decrypts_aes128_stream_and_updates_plaintext_length() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Contents 3 0 R >>");
    binary_stream_object(
        &mut pdf,
        3,
        &[
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x48, 0x16, 0x59, 0xfd, 0x9f, 0x2f, 0x8f, 0x87, 0x71, 0x05, 0x53, 0xac,
            0xaf, 0xe1, 0x96, 0x40,
        ],
    );
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R4_AES} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R4_AES);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(b"user"), Some(&file_id))
        .expect("R4 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let resolved = resolver
        .resolve(reference(3, 0))
        .expect("AES streamを解決できる");
    let stream = resolved.as_stream().expect("ストリームオブジェクト");

    assert_eq!(stream.data(), b"stream data");
    assert_eq!(
        stream.dictionary().get(b"Length".as_slice()),
        Some(&PdfObject::from(11))
    );
}

#[test]
fn decrypts_rc4_128_string_and_stream() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R /Contents 3 0 R >>");
    pdf.object(2, 0, "<a2d9f78e4073>");
    binary_stream_object(
        &mut pdf,
        3,
        &[
            0x27, 0x4c, 0xdb, 0xc2, 0x07, 0x75, 0x1b, 0xf7, 0xcf, 0x6e, 0xb2,
        ],
    );
    let data = pdf.finish_with_trailer(
        "",
        &format!("/Encrypt {R3_RC4_128} /ID [<{FILE_ID}> <{FILE_ID}>]"),
    );
    let handler = standard_handler(R3_RC4_128);
    let file_id = file_id();
    let authentication = handler
        .authenticate(Some(R3_PASSWORD), Some(&file_id))
        .expect("R3 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let string = resolver
        .resolve(reference(2, 0))
        .expect("RC4文字列を解決できる");
    let stream = resolver
        .resolve(reference(3, 0))
        .expect("RC4 streamを解決できる");

    assert_eq!(string.as_string_bytes(), Some(b"secret".as_slice()));
    assert_eq!(
        stream.as_stream().expect("ストリームオブジェクト").data(),
        b"stream data"
    );
}

#[test]
fn decrypts_aes256_string_and_stream() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Value 2 0 R /Contents 3 0 R >>");
    pdf.object(
        2,
        0,
        "<000102030405060708090a0b0c0d0e0ff426bf06192f38f2de5c29f36f4edad7>",
    );
    binary_stream_object(
        &mut pdf,
        3,
        &[
            0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d,
            0x0e, 0x0f, 0x92, 0x51, 0xde, 0xcc, 0x29, 0xd0, 0xf6, 0x5e, 0xae, 0x9e, 0x8a, 0xa5,
            0x58, 0x98, 0x32, 0xb4,
        ],
    );
    let data = pdf.finish_with_trailer("", &format!("/Encrypt {R5_AES_256}"));
    let handler = standard_handler(R5_AES_256);
    let authentication = handler
        .authenticate(Some(b"user-r5"), None)
        .expect("R5 の利用者パスワードで認証できる");
    let mut resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let string = resolver
        .resolve(reference(2, 0))
        .expect("AES256文字列を解決できる");
    let stream = resolver
        .resolve(reference(3, 0))
        .expect("AES256 streamを解決できる");

    assert_eq!(string.as_string_bytes(), Some(b"secret".as_slice()));
    assert_eq!(
        stream.as_stream().expect("ストリームオブジェクト").data(),
        b"stream data"
    );
}

fn binary_stream_object_with_dictionary_at(
    pdf: &mut PdfFixture,
    number: u64,
    dictionary: &str,
    data: &[u8],
) -> usize {
    let offset = pdf.data.len();
    pdf.entries.push((number, offset, 0));
    pdf.data
        .extend_from_slice(format!("{number} 0 obj\n<< {dictionary} >>\nstream\n").as_bytes());
    pdf.data.extend_from_slice(data);
    pdf.data.extend_from_slice(b"\nendstream\nendobj\n");
    offset
}
