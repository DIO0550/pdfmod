//! Lexer 層のバイト操作ユーティリティ。
//!
//! Lexer 状態に依存しない純関数のみを置く。
//! 本モジュールはトークン化ロジック（`hex_string` / `literal_string` 等）から
//! 共通利用される計算ヘルパの集約先である。

/// 16 進数字 1 バイト（`'0'-'9'` / `'a'-'f'` / `'A'-'F'`）を 0-15 のニブル値に変換する純関数。
///
/// # 契約
/// - 呼び出し側で `is_ascii_hexdigit` を確認済みであることを前提とする。
/// - 前提を満たす入力に対して panic しない（lexer 層の panic 不在契約に影響しない）。
/// - 契約違反の入力（非 16 進数字）では結果は未定義相当であり、
///   debug ビルドでは減算 overflow により panic しうる。
pub(super) fn hex_value(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => b - b'a' + 10,
        _ => b - b'A' + 10,
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
