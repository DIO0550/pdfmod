mod comment_interleaved;
mod deep_nested;
mod empty;
mod flat_scalars;
mod lexer_error_propagation;
mod mixed_types;
mod nested;
mod pdf_sample;
mod unexpected_token;
mod unmatched_eof;
mod whitespace_variants;

use super::Parser;

fn parser(input: &[u8]) -> Parser<'_> {
    Parser::new(input)
}
