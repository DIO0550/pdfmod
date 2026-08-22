use super::super::LexOutcome;
use crate::lexer::token::Token;

#[test]
fn map_converts_the_lexed_payload() {
    // take_token が (Token, usize) から Token を取り出す形を確認する。
    let outcome = LexOutcome::Lexed((Token::ArrayBegin, 5));

    let mapped = outcome.map(|(token, _)| token);

    assert_eq!(mapped, LexOutcome::Lexed(Token::ArrayBegin));
}

#[test]
fn map_passes_eof_through_without_calling_the_closure() {
    // Eof は透過し、クロージャは呼ばれないことを確認する。
    let outcome: LexOutcome<(Token, usize)> = LexOutcome::Eof;
    let mut called = false;

    let mapped = outcome.map(|(token, _)| {
        called = true;
        token
    });

    assert_eq!(mapped, LexOutcome::Eof);
    assert!(!called, "closure should not run for Eof");
}

#[test]
fn map_passes_malformed_through_keeping_its_position() {
    // Malformed は位置を保ったまま透過し、クロージャは呼ばれないことを確認する。
    let outcome: LexOutcome<(Token, usize)> = LexOutcome::Malformed { position: 11 };
    let mut called = false;

    let mapped = outcome.map(|(token, _)| {
        called = true;
        token
    });

    assert_eq!(mapped, LexOutcome::Malformed { position: 11 });
    assert!(!called, "closure should not run for Malformed");
}
