//! PDF 整数オブジェクトを表す `PdfInteger` モジュール。

use core::fmt;

/// PDF 整数オブジェクトを表す newtype。
///
/// ISO 32000-1 §7.3.3 に準拠し、`i64` の定義域全域を無検証で保持する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct PdfInteger(i64);

impl PdfInteger {
    /// 整数値から `PdfInteger` を構築する。
    pub fn new(value: i64) -> Self {
        Self(value)
    }

    /// 内部の整数値を返す。
    #[must_use]
    pub fn value(&self) -> i64 {
        self.0
    }
}

impl fmt::Display for PdfInteger {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl From<i64> for PdfInteger {
    fn from(value: i64) -> Self {
        Self::new(value)
    }
}

impl From<PdfInteger> for i64 {
    fn from(integer: PdfInteger) -> Self {
        integer.value()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_and_value() {
        let i = PdfInteger::new(42);
        assert_eq!(i.value(), 42);
    }

    #[test]
    fn min_max_values() {
        assert_eq!(PdfInteger::new(i64::MIN).value(), i64::MIN);
        assert_eq!(PdfInteger::new(i64::MAX).value(), i64::MAX);
        assert_eq!(PdfInteger::new(0).value(), 0);
    }

    #[test]
    fn from_roundtrip() {
        let i: PdfInteger = 42_i64.into();
        assert_eq!(i.value(), 42);
        let orig: i64 = i.into();
        assert_eq!(orig, 42);
    }

    #[test]
    fn display_formatting() {
        assert_eq!(format!("{:06}", PdfInteger::new(42)), "000042");
        assert_eq!(format!("{}", PdfInteger::new(-100)), "-100");
    }
}
