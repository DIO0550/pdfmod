mod bom;
mod pdf_doc_encoding;
mod syntax;
mod utf16;
mod utf8;

use super::error::{TextDecodeError, TextDecodeErrorKind};
use super::{DecodePolicy, PdfTextString};

fn strict(bytes: &[u8]) -> Result<PdfTextString, TextDecodeError> {
    PdfTextString::decode(bytes, DecodePolicy::Strict)
}

fn replaced(bytes: &[u8]) -> String {
    PdfTextString::decode(bytes, DecodePolicy::Replace)
        .unwrap()
        .into()
}

fn assert_error(bytes: &[u8], kind: TextDecodeErrorKind, offset: usize) {
    let error = strict(bytes).unwrap_err();
    assert_eq!(error.kind(), kind);
    assert_eq!(error.offset().value(), offset);
}
