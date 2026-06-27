use super::super::*;

#[test]
fn read_hex_string_position_never_exceeds_input_len_on_various_inputs() {
    // 複数入力で呼び出し後の position が input.len() を超えないことを確認する
    let inputs: &[&[u8]] = &[
        b"",
        b"<",
        b"<>",
        b"<41>",
        b"<XY>",
        b"<48656C6C6F>",
        b"<F>",
        b"<48 65>",
    ];
    for input in inputs {
        let mut lexer = Lexer::new(input);
        let _ = lexer.read_hex_string();
        assert!(
            lexer.position() <= input.len(),
            "position {} exceeds input.len() {} for {:?}",
            lexer.position(),
            input.len(),
            input
        );
    }
}

#[test]
fn read_hex_string_does_not_panic_when_pos_is_usize_max() {
    // pos == usize::MAX で構築しても panic せず pos が巻き戻ることを確認する
    let mut lexer = Lexer {
        input: b"<41>",
        pos: usize::MAX,
    };
    let result = lexer.read_hex_string();
    assert!(result.is_none());
    assert_eq!(lexer.position(), usize::MAX);
}
