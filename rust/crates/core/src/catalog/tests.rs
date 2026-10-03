use super::*;
use crate::{object::object_kind::ObjectKind, parser::Parser};

mod structure;
mod version;
mod view;

fn parse(input: &[u8]) -> Result<Catalog, CatalogError> {
    let object = Parser::new(input).parse_object().unwrap();
    Catalog::from_object(Rc::new(object), PdfVersion::V1_4, ByteOffset::new(123))
}
