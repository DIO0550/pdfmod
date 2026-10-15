use super::*;
use crate::{
    date::{OffsetSign, PdfDate},
    document_info::{
        error::{DocumentInfoErrorKind, InfoValueError},
        trapped::Trapped,
        DocumentInfo,
    },
    object::ObjectKind,
    text_string::{error::TextDecodeErrorKind, PdfTextString},
};

mod malformed;
mod references;
mod values;

fn parse(body: &str) -> DocumentInfo {
    let mut pdf = PdfFixture::new();
    pdf.object(5, 0, body);
    let data = pdf.finish_with_trailer("", "/Info 5 0 R");
    ObjectResolver::open(&data)
        .unwrap()
        .document_info()
        .unwrap()
}

fn text<'a>(result: Result<Option<&'a PdfTextString>, &InfoValueError>) -> Option<&'a str> {
    result.unwrap().map(PdfTextString::as_str)
}

fn assert_empty(info: &DocumentInfo) {
    assert_eq!(info.title(), Ok(None));
    assert_eq!(info.author(), Ok(None));
    assert_eq!(info.subject(), Ok(None));
    assert_eq!(info.keywords(), Ok(None));
    assert_eq!(info.creator(), Ok(None));
    assert_eq!(info.producer(), Ok(None));
    assert_eq!(info.creation_date(), Ok(None));
    assert_eq!(info.mod_date(), Ok(None));
    assert_eq!(info.trapped(), Ok(Trapped::Unknown));
}
