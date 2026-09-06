mod basic;
mod boundary;
mod comment_interleaved;
mod eof_boundary;
mod header_invalid;
mod lexer_error;
mod missing_endobj;
mod pdf_sample;

use super::Parser;
use crate::object::generation_number::GenerationNumber;
use crate::object::indirect_object::IndirectObject;
use crate::object::indirect_ref::IndirectRef;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;

fn parser(input: &[u8]) -> Parser<'_> {
    Parser::new(input)
}

/// `(n, g, object)` から期待値 `IndirectObject` を組み立てる小ヘルパ。
fn indirect_object(n: u64, g: u16, object: PdfObject) -> IndirectObject {
    IndirectObject::new(
        ObjectId::new(
            ObjectNumber::new(n).expect("positive object number"),
            GenerationNumber::new(g),
        ),
        object,
    )
}

/// `(n, g)` から content 用の `PdfObject::Reference` を組み立てる小ヘルパ。
fn reference(n: u64, g: u16) -> PdfObject {
    PdfObject::Reference(IndirectRef::new(ObjectId::new(
        ObjectNumber::new(n).expect("positive object number"),
        GenerationNumber::new(g),
    )))
}
