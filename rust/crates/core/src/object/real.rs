//! PDF 実数オブジェクトを表す `PdfReal` モジュール。

use core::fmt;

/// PDF 実数オブジェクトを表す newtype。
///
/// `f64` を無検証で保持する。IEEE 754 の `NaN != NaN` の振る舞いを維持するため、
/// `Eq`, `Hash`, `Ord`, `PartialOrd` は意図的に実装しない。
#[derive(Debug, Clone, Copy, PartialEq)]
#[must_use]
pub struct PdfReal(f64);

impl PdfReal {
    /// 浮動小数点数から `PdfReal` を構築する。
    pub fn new(value: f64) -> Self {
        Self(value)
    }

    /// 内部の浮動小数点数値を返す。
    #[must_use]
    pub fn value(&self) -> f64 {
        self.0
    }
}

impl fmt::Display for PdfReal {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl From<f64> for PdfReal {
    fn from(value: f64) -> Self {
        Self::new(value)
    }
}

impl From<PdfReal> for f64 {
    fn from(real: PdfReal) -> Self {
        real.value()
    }
}

#[cfg(test)]
#[allow(clippy::approx_constant)]
mod tests {
    use super::*;

    #[test]
    fn new_and_value() {
        let r = PdfReal::new(3.14);
        assert!((r.value() - 3.14).abs() < f64::EPSILON);
    }

    #[test]
    fn nan_inequality() {
        let nan1 = PdfReal::new(f64::NAN);
        let nan2 = PdfReal::new(f64::NAN);
        assert_ne!(nan1, nan2);
        assert!(nan1.value().is_nan());
    }

    #[test]
    fn signed_zero() {
        let neg_zero = PdfReal::new(-0.0);
        assert!(neg_zero.value().is_sign_negative());
        let pos_zero = PdfReal::new(0.0);
        assert!(pos_zero.value().is_sign_positive());
        assert_eq!(neg_zero, pos_zero); // IEEE 754: -0.0 == +0.0
    }

    #[test]
    fn infinity_values() {
        let inf = PdfReal::new(f64::INFINITY);
        assert!(inf.value().is_infinite());
        assert!(inf.value().is_sign_positive());

        let neg_inf = PdfReal::new(f64::NEG_INFINITY);
        assert!(neg_inf.value().is_infinite());
        assert!(neg_inf.value().is_sign_negative());
    }

    #[test]
    fn from_roundtrip() {
        let r: PdfReal = 2.718_f64.into();
        assert!((r.value() - 2.718).abs() < f64::EPSILON);
        let orig: f64 = r.into();
        assert!((orig - 2.718).abs() < f64::EPSILON);
    }

    #[test]
    fn display_formatting() {
        assert_eq!(format!("{}", PdfReal::new(1.5)), "1.5");
    }
}
