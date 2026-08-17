mod crypt_filter;
mod keys;
mod standard_algorithm;
mod unsupported;

use crate::byte_offset::ByteOffset;
use crate::encrypt::error::EncryptError;
use crate::encrypt::EncryptDictionary;
use crate::object::dictionary::PdfDictionary;
use crate::object::pdf_object::PdfObject;
use crate::parser::Parser;

/// テスト用の位置。値そのものに意味は無い。
pub(super) fn position() -> ByteOffset {
    ByteOffset::new(0)
}

/// PDF のソース文字列（`<< … >>`）を辞書としてパースする。
///
/// `xref/trailer/parse/tests/encrypt.rs` と同じ「ソース文字列 → パース」方式に
/// 揃えるためのヘルパ（`parser::dictionary_tests::parse_dict` は `pub(super)` で
/// このモジュールからは使えない）。
pub(super) fn dictionary(source: &[u8]) -> PdfDictionary {
    let mut parser = Parser::new(source);
    match parser
        .parse_object()
        .expect("test source should be a valid object")
    {
        PdfObject::Dictionary(dictionary) => dictionary,
        other => panic!("expected Dictionary, got {other:?}"),
    }
}

/// ソース文字列から暗号化辞書を型に変換する（成功を期待する）。
pub(super) fn encrypt(source: &[u8]) -> EncryptDictionary {
    EncryptDictionary::from_dictionary(dictionary(source), position())
        .expect("encrypt dictionary should be converted")
}

/// ソース文字列から暗号化辞書を型に変換する（失敗を期待する）。
pub(super) fn encrypt_err(source: &[u8]) -> EncryptError {
    EncryptDictionary::from_dictionary(dictionary(source), position())
        .expect_err("encrypt dictionary should be rejected")
}
