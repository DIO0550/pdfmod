use super::decryption::{
    binary_stream_object, file_id, standard_handler, FILE_ID, R3_PASSWORD, R3_RC4_128, R4_AES,
    R5_AES_256,
};
use super::*;

fn resolve_root_content(mut resolver: ObjectResolver<'_>, root: IndirectRef) -> Rc<PdfObject> {
    let catalog = resolver.resolve(root).expect("ルート辞書を解決できる");
    let contents = catalog
        .as_dictionary()
        .and_then(|dictionary| dictionary.get(b"Contents".as_slice()))
        .and_then(PdfObject::as_reference)
        .expect("Contents参照を取得できる");
    resolver.resolve(contents).expect("ページ内容を解決できる")
}

#[test]
fn opens_rc4_128_document_and_resolves_content_stream() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Type /Catalog /Contents 3 0 R >>");
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
    let resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let content = resolve_root_content(resolver, reference(1, 0));

    assert_eq!(
        content.as_stream().expect("コンテンツストリーム").data(),
        b"stream data"
    );
}

#[test]
fn opens_aes128_document_and_resolves_content_stream() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Type /Catalog /Contents 3 0 R >>");
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
    let resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let content = resolve_root_content(resolver, reference(1, 0));

    assert_eq!(
        content.as_stream().expect("コンテンツストリーム").data(),
        b"stream data"
    );
}

#[test]
fn opens_aes256_document_and_resolves_content_stream() {
    let mut pdf = PdfFixture::new();
    pdf.object(1, 0, "<< /Type /Catalog /Contents 3 0 R >>");
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
    let resolver = ObjectResolver::open_authenticated(&data, authentication)
        .expect("認証済みresolverを開ける");

    let content = resolve_root_content(resolver, reference(1, 0));

    assert_eq!(
        content.as_stream().expect("コンテンツストリーム").data(),
        b"stream data"
    );
}
