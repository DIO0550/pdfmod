use super::super::LexOutcome;
use crate::lexer::token::Token;

#[test]
fn lexed_round_trips_its_payload() {
    // Lexed に入れた Token がそのまま取り出せることを確認する。
    let outcome = LexOutcome::Lexed(Token::ArrayBegin);

    let LexOutcome::Lexed(token) = outcome else {
        panic!("Lexed variant should hold the token");
    };
    assert_eq!(token, Token::ArrayBegin);
}

#[test]
fn lexed_carries_token_and_position_pair() {
    // take 系が使う (Token, usize) 複合ペイロードも同じ型で運べることを確認する。
    let outcome = LexOutcome::Lexed((Token::ArrayEnd, 7));

    let LexOutcome::Lexed((token, position)) = outcome else {
        panic!("Lexed variant should hold the pair");
    };
    assert_eq!(token, Token::ArrayEnd);
    assert_eq!(position, 7);
}

#[test]
fn eof_is_a_unit_variant() {
    // Eof は位置フィールドを持たない単位バリアントであることを確認する。
    let outcome: LexOutcome<Token> = LexOutcome::Eof;

    assert!(matches!(outcome, LexOutcome::Eof));
}

#[test]
fn malformed_holds_its_position() {
    // Malformed が不正バイト位置を保持することを確認する。
    let outcome: LexOutcome<Token> = LexOutcome::Malformed { position: 42 };

    let LexOutcome::Malformed { position } = outcome else {
        panic!("Malformed variant should hold the position");
    };
    assert_eq!(position, 42);
}

#[test]
fn malformed_at_position_zero_is_not_eof() {
    // 入力先頭が不正バイトのとき position は 0 になるが Eof とは区別されることを確認する。
    let outcome: LexOutcome<Token> = LexOutcome::Malformed { position: 0 };

    assert!(matches!(outcome, LexOutcome::Malformed { position: 0 }));
    assert!(!matches!(outcome, LexOutcome::Eof));
}

#[test]
fn same_variant_with_same_payload_are_equal() {
    // 同一バリアント・同一ペイロードどうしが PartialEq で等しいことを確認する。
    assert_eq!(
        LexOutcome::Lexed(Token::ArrayBegin),
        LexOutcome::Lexed(Token::ArrayBegin)
    );
    assert_eq!(LexOutcome::<Token>::Eof, LexOutcome::<Token>::Eof);
    assert_eq!(
        LexOutcome::<Token>::Malformed { position: 3 },
        LexOutcome::<Token>::Malformed { position: 3 }
    );
}

#[test]
fn different_variants_are_not_equal() {
    // 3 状態が互いに識別可能であることを確認する。
    assert_ne!(
        LexOutcome::<Token>::Eof,
        LexOutcome::<Token>::Malformed { position: 0 }
    );
    assert_ne!(
        LexOutcome::Lexed(Token::ArrayBegin),
        LexOutcome::<Token>::Eof
    );
    assert_ne!(
        LexOutcome::<Token>::Malformed { position: 3 },
        LexOutcome::<Token>::Malformed { position: 4 }
    );
}
