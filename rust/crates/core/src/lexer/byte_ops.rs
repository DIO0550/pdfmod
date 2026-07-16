//! Lexer 層のバイト操作ユーティリティ。
//!
//! Lexer 状態に依存しない純関数のみを置く。
//! 本モジュールはトークン化ロジック（`hex_string` / `literal_string` 等）から
//! 共通利用される計算ヘルパの集約先である。

/// 16 進数字 1 バイト（`'0'-'9'` / `'a'-'f'` / `'A'-'F'`）を 0-15 のニブル値に変換する純関数。
///
/// # 契約
/// - 16 進数字なら `Some(0-15)`、それ以外のバイトでは `None` を返す全域関数。
/// - 任意の入力に対して panic しない（lexer 層の panic 不在契約）。
pub(super) fn hex_value(b: u8) -> Option<u8> {
    match b {
        b'0'..=b'9' => Some(b - b'0'),
        b'a'..=b'f' => Some(b - b'a' + 10),
        b'A'..=b'F' => Some(b - b'A' + 10),
        _ => None,
    }
}

/// PDF §7.3.4.3 16 進ペア合成: 上位 4bit と下位 4bit から 1 バイトを合成する純関数。
///
/// # 契約
/// - 引数は 0-15 ニブル前提（`hex_value` 後）。
/// - それ以外は debug build で panic（`debug_assert!` で契約違反検出）。release では消える（wrap）。
/// - `hex_value(b)` 経由の通常呼び出しでは到達不能だが、純関数として外から呼ばれる場合の安全性のため。
/// - release ビルドでは `debug_assert` が消えるため、lexer 層の panic 不在契約
///   （任意入力で panic しない）には影響しない。
pub(super) fn combine_pair(high_nibble: u8, low_nibble: u8) -> u8 {
    debug_assert!(
        high_nibble < 0x10 && low_nibble < 0x10,
        "combine_pair: ニブル値は 0-15 範囲のみ"
    );
    (high_nibble << 4) | low_nibble
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hex_value_converts_hex_digit_bytes_to_nibble_values() {
        // '0'-'9' / 'a'-'f' / 'A'-'F' の全 22 バイトが Some(0-15) の期待値に変換されることを確認する
        let cases: [(u8, u8); 22] = [
            (b'0', 0x0),
            (b'1', 0x1),
            (b'2', 0x2),
            (b'3', 0x3),
            (b'4', 0x4),
            (b'5', 0x5),
            (b'6', 0x6),
            (b'7', 0x7),
            (b'8', 0x8),
            (b'9', 0x9),
            (b'a', 0xA),
            (b'b', 0xB),
            (b'c', 0xC),
            (b'd', 0xD),
            (b'e', 0xE),
            (b'f', 0xF),
            (b'A', 0xA),
            (b'B', 0xB),
            (b'C', 0xC),
            (b'D', 0xD),
            (b'E', 0xE),
            (b'F', 0xF),
        ];
        for (byte, expected) in cases {
            assert_eq!(
                hex_value(byte),
                Some(expected),
                "hex_value(0x{byte:02X}) should be Some(0x{expected:X})"
            );
        }
    }

    #[test]
    fn hex_value_agrees_with_is_ascii_hexdigit_for_all_256_bytes() {
        // 全 256 バイトを総当たりし、Some を返すのが is_ascii_hexdigit な 22 バイトのみで、
        // その値がすべて 0-15 に収まることを確認する（全域関数・panic 不在の回帰テスト）
        let mut some_count = 0;
        for byte in 0x00..=0xFFu8 {
            match hex_value(byte) {
                Some(nibble) => {
                    assert!(
                        byte.is_ascii_hexdigit(),
                        "hex_value(0x{byte:02X}) is Some but not an ASCII hex digit"
                    );
                    assert!(
                        nibble <= 0xF,
                        "hex_value(0x{byte:02X}) nibble 0x{nibble:X} should be 0-15"
                    );
                    some_count += 1;
                }
                None => {
                    assert!(
                        !byte.is_ascii_hexdigit(),
                        "hex_value(0x{byte:02X}) is None but is an ASCII hex digit"
                    );
                }
            }
        }
        assert_eq!(some_count, 22, "hex digits should be exactly 22 bytes");
    }

    #[test]
    fn combine_pair_combines_high_and_low_nibbles_into_byte() {
        // 上下ニブル（0..=15）から 1 バイトが (high << 4) | low で合成されることを確認する
        assert_eq!(combine_pair(0x0, 0x0), 0x00);
        assert_eq!(combine_pair(0xF, 0xF), 0xFF);
        assert_eq!(combine_pair(0x4, 0x8), 0x48);
        assert_eq!(combine_pair(0xA, 0x5), 0xA5);
        assert_eq!(combine_pair(0xA, 0x0), 0xA0);
    }

    // `debug_assert!` は release ビルドで no-op になるため、`#[should_panic]` テストは
    // debug ビルド限定（`cargo test --release` でスキップ）にする。
    #[test]
    #[should_panic]
    #[cfg(debug_assertions)]
    fn combine_pair_panics_on_high_nibble_out_of_range_in_debug() {
        // 契約違反: high が 0x10 以上のとき debug build で debug_assert! が発火することを確認する
        let _ = combine_pair(0x10, 0x0);
    }

    #[test]
    #[should_panic]
    #[cfg(debug_assertions)]
    fn combine_pair_panics_on_low_nibble_out_of_range_in_debug() {
        // 契約違反: low が 0x10 以上のとき debug build で debug_assert! が発火することを確認する
        let _ = combine_pair(0x0, 0x10);
    }
}
