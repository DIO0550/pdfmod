mod array_value;
mod comment_interleaved;
mod duplicate_key;
mod empty;
mod key_type_error;
mod lexer_error_propagation;
mod mixed_value_types;
mod multiple_entries;
mod nested;
mod null_value;
mod pdf_sample;
mod single_entry;
mod unmatched_eof;
mod whitespace_variants;

use super::super::object::dictionary::PdfDictionary;
use super::super::object::pdf_object::PdfObject;
use super::Parser;

fn parser(input: &[u8]) -> Parser<'_> {
    Parser::new(input)
}

pub(super) fn parse_dict(input: &[u8]) -> PdfDictionary {
    let mut p = parser(input);
    match p.parse_object().expect("dictionary should parse") {
        PdfObject::Dictionary(d) => d,
        other => panic!("expected Dictionary, got {:?}", other),
    }
}
