use super::*;
use crate::{geometry::rectangle::RectangleError, object::ObjectKind, parser::Parser};

mod defaults;
mod validation;

fn parse(input: &[u8]) -> Result<PageBoxes, PageBoxError> {
    let PdfObject::Dictionary(dictionary) = Parser::new(input).parse_object().unwrap() else {
        panic!("expected dictionary");
    };
    PageBoxes::from_dictionary(&dictionary, ByteOffset::new(123))
}

fn bounds(rectangle: &Rectangle) -> [f64; 4] {
    [
        rectangle.min_x(),
        rectangle.min_y(),
        rectangle.max_x(),
        rectangle.max_y(),
    ]
}
