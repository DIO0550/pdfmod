//! PDF 真偽値オブジェクトを表す `PdfBoolean` モジュール。

use core::fmt;

/// PDF 真偽値オブジェクトを表す newtype。
///
/// 妥当性検証は行わず、`bool`（`true` / `false`）を無検証で保持する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct PdfBoolean(bool);

impl PdfBoolean {
    /// 真偽値から `PdfBoolean` を構築する。
    pub fn new(value: bool) -> Self {
        Self(value)
    }

    /// 内部の真偽値を返す。
    #[must_use]
    pub fn value(&self) -> bool {
        self.0
    }
}

impl fmt::Display for PdfBoolean {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

impl From<bool> for PdfBoolean {
    fn from(value: bool) -> Self {
        Self::new(value)
    }
}

impl From<PdfBoolean> for bool {
    fn from(boolean: PdfBoolean) -> Self {
        boolean.value()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn new_and_value() {
        let b = PdfBoolean::new(true);
        assert!(b.value());
        let b_false = PdfBoolean::new(false);
        assert!(!b_false.value());
    }

    #[test]
    fn from_roundtrip() {
        let b: PdfBoolean = true.into();
        assert!(b.value());
        let orig: bool = b.into();
        assert!(orig);

        let b2: PdfBoolean = false.into();
        assert!(!b2.value());
        let orig2: bool = b2.into();
        assert!(!orig2);
    }

    #[test]
    fn display_formatting() {
        assert_eq!(format!("{}", PdfBoolean::new(true)), "true");
        assert_eq!(format!("{}", PdfBoolean::new(false)), "false");
    }

    #[test]
    fn copy_and_eq() {
        let b1 = PdfBoolean::new(true);
        let b2 = b1;
        assert_eq!(b1, b2);
        assert_ne!(b1, PdfBoolean::new(false));
    }
}
