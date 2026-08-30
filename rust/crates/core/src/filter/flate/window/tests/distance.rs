use super::*;

// 距離シンボルと追加ビットから、RFC 1951 §3.2.5 の表どおりの距離が得られることを確認する。
#[test]
fn distance_symbols_resolve_to_table_values() {
    // (シンボル, 追加ビットを載せた入力, 期待する距離)
    let cases: [(u16, &[u8], usize); 4] = [
        // 0: 基準 1・追加ビット無し（最小距離）
        (0, &[], 1),
        // 3: 基準 4・追加ビット無し（追加ビットが増える直前）
        (3, &[], 4),
        // 4: 基準 5・追加ビット 1 → 1 を読んで 6
        (4, &[0x01], 6),
        // 29: 基準 24577・追加ビット 13 → 8191 を読んで 32768（ウィンドウ上限）
        (29, &[0xFF, 0x1F], MAX_DISTANCE),
    ];

    for (symbol, input, expected) in cases {
        let mut reader = BitReader::new(input);

        assert_eq!(
            Distance::read(&mut reader, symbol),
            Ok(Distance::new(expected)),
            "symbol {symbol} should resolve to distance {expected}"
        );
    }
}

// 0..=29 の範囲外の距離シンボルが InvalidDistanceSymbol になることを確認する。
#[test]
fn distance_symbols_outside_the_table_are_rejected() {
    // 30 / 31 は未使用符号
    for symbol in [30_u16, 31] {
        let mut reader = BitReader::new(&[]);

        assert_eq!(
            Distance::read(&mut reader, symbol),
            Err(FlateError::invalid_distance_symbol_at(
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
    // 29 は追加ビットを 13 個要求するが、入力は 1 バイトしかない
    let mut reader = BitReader::new(&[0xFF]);

    assert_eq!(
        Distance::read(&mut reader, 29),
        Err(FlateError::unexpected_eof_at(ByteOffset::new(1)))
    );
}
