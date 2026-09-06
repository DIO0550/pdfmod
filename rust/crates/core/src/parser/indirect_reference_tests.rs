mod array_value;
mod backtrack_g_overflow;
mod backtrack_n_overflow;
mod backtrack_negative_n;
mod backtrack_no_r;
mod basic;
mod boundary;
mod comment_interleaved;
mod dictionary_value;
mod eof_boundary;
mod lookahead_lexer_error;
mod multiple_objects;
mod pdf_sample;
mod whitespace_variants;

use super::Parser;
use crate::object::generation_number::GenerationNumber;
use crate::object::indirect_ref::IndirectRef;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;

fn parser(input: &[u8]) -> Parser<'_> {
    Parser::new(input)
}

/// `(n, g)` の組から `PdfObject::Reference` を組み立てる小ヘルパ。
fn reference(n: u64, g: u16) -> PdfObject {
    PdfObject::Reference(IndirectRef::new(ObjectId::new(
        ObjectNumber::new(n).expect("positive object number"),
        GenerationNumber::new(g),
    )))
}
