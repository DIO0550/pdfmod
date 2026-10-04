use super::*;
use crate::parser::Parser;

mod intersection;
mod validation;

fn parse(input: &[u8]) -> Result<Rectangle, RectangleError> {
    let PdfObject::Array(array) = Parser::new(input).parse_object().unwrap() else {
        panic!("expected array");
    };
    Rectangle::try_from(&array)
}
