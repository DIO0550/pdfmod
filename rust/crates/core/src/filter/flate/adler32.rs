//! Adler-32 チェックサム。RFC 1950 §9 に対応する。

/// Adler-32 の法（65521、65536 未満の最大の素数）。
const MOD_ADLER: u32 = 65521;

/// Adler-32 の計算状態。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct Adler32 {
    /// バイト値の総和（初期値 1）。
    sum: u32,
    /// `sum` の総和（初期値 0）。
    sum_of_sums: u32,
}

impl Adler32 {
    /// 初期状態（`sum = 1`、`sum_of_sums = 0`）を作る。
    pub fn new() -> Self {
        Self {
            sum: 1,
            sum_of_sums: 0,
        }
    }

    /// バイト列を取り込んで状態を更新する。
    pub fn update(&mut self, data: &[u8]) {
        for &byte in data {
            self.sum = (self.sum + u32::from(byte)) % MOD_ADLER;
            self.sum_of_sums = (self.sum_of_sums + self.sum) % MOD_ADLER;
        }
    }

    /// 現在のチェックサム値（上位 16 ビットが `sum_of_sums`、下位 16 ビットが `sum`）。
    #[must_use]
    pub fn value(&self) -> u32 {
        (self.sum_of_sums << 16) | self.sum
    }
}

impl Default for Adler32 {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 空データのチェックサムが初期値 1 になることを確認する（RFC 1950 §9）。
    #[test]
    fn empty_data_has_checksum_one() {
        let checksum = Adler32::new();

        assert_eq!(checksum.value(), 1);
    }

    // 既知の入力に対するチェックサムが参照実装と一致することを確認する。
    #[test]
    fn known_inputs_match_reference_values() {
        let cases: [(&[u8], u32); 2] = [(b"abc", 0x024D_0127), (b"hello", 0x062C_0215)];

        for (data, expected) in cases {
            let mut checksum = Adler32::new();
            checksum.update(data);

            assert_eq!(
                checksum.value(),
                expected,
                "adler32 of {data:?} should be {expected:#010X}"
            );
        }
    }

    // update を分割して呼んでも一括更新と同じ値になることを確認する。
    #[test]
    fn split_updates_match_single_update() {
        let mut split = Adler32::new();
        split.update(b"he");
        split.update(b"llo");

        let mut single = Adler32::new();
        single.update(b"hello");

        assert_eq!(split.value(), single.value());
    }

    // 総和が法 65521 を超える長さの入力でも剰余が正しく畳み込まれることを確認する。
    #[test]
    fn long_input_folds_sums_by_modulus() {
        let mut checksum = Adler32::new();
        checksum.update(&[0xFF; 1000]);

        assert_eq!(checksum.value(), 0xE6E9_E446);
    }
}
