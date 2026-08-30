use super::*;

// 長さシンボルと追加ビットから、RFC 1951 §3.2.5 の表どおりのコピー長が得られることを確認する。
#[test]
fn length_symbols_resolve_to_table_values() {
    // (シンボル, 追加ビットを載せた入力, 期待するコピー長)
    let cases: [(u16, &[u8], usize); 4] = [
        // 257: 基準 3・追加ビット無し
        (257, &[], 3),
        // 264: 基準 10・追加ビット無し（追加ビットが増える直前）
        (264, &[], 10),
        // 265: 基準 11・追加ビット 1 → 1 を読んで 12
        (265, &[0x01], 12),
        // 285: 基準 258・追加ビット無し（最大長）
        (285, &[], 258),
    ];

    for (symbol, input, expected) in cases {
        let mut reader = BitReader::new(input);

        assert_eq!(
            Length::read(&mut reader, symbol),
            Ok(Length::new(expected)),
            "symbol {symbol} should resolve to length {expected}"
        );
    }
}

// 257..=285 の範囲外の長さシンボルが InvalidLengthSymbol になることを確認する。
#[test]
fn length_symbols_outside_the_table_are_rejected() {
    // 256 はブロック終端、286 / 287 は未使用符号
    for symbol in [256_u16, 286, 287] {
        let mut reader = BitReader::new(&[]);

        assert_eq!(
            Length::read(&mut reader, symbol),
            Err(FlateError::invalid_length_symbol_at(
                ByteOffset::new(0),
                symbol
            )),
            "symbol {symbol} should be rejected"
        );
    }
}

// 追加ビットの途中で入力が尽きた場合に UnexpectedEof になることを確認する。
#[test]
fn truncated_extra_bits_report_unexpected_eof() {
    // 265 は追加ビットを 1 つ要求するが、入力は空
    let mut reader = BitReader::new(&[]);

    assert_eq!(
        Length::read(&mut reader, 265),
        Err(FlateError::unexpected_eof_at(ByteOffset::new(0)))
    );
}
