//! ページ位置の 0 起点と 1 起点を区別する。

use std::num::NonZeroUsize;

/// 0 起点のページ位置。無検証で全 usize を受理し、範囲検証は PageTree が行う。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PageIndex(usize);

impl PageIndex {
    /// 0 起点の位置を返す。
    pub fn value(self) -> usize {
        self.0
    }

    /// 1 起点へ変換する。usize::MAX は表現できないため None。
    pub fn number(self) -> Option<PageNumber> {
        self.0.checked_add(1).and_then(PageNumber::new)
    }
}

impl From<usize> for PageIndex {
    fn from(value: usize) -> Self {
        Self(value)
    }
}

/// 1 起点のページ番号。0 は構築できず、文書内の範囲検証は PageTree が行う。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct PageNumber(NonZeroUsize);

impl PageNumber {
    /// 1 起点の番号を構築する。0 の場合は None。
    pub fn new(value: usize) -> Option<Self> {
        NonZeroUsize::new(value).map(Self)
    }

    /// 1 起点の番号を返す。
    pub fn value(self) -> usize {
        self.0.get()
    }
}

impl From<PageNumber> for PageIndex {
    fn from(number: PageNumber) -> Self {
        Self(number.value().saturating_sub(1))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn numbering_and_overflow_boundaries() {
        assert_eq!(PageNumber::new(0), None);
        for value in [1, 2, usize::MAX] {
            let number = PageNumber::new(value).unwrap();
            let index = PageIndex::from(number);
            assert_eq!(index.value(), value - 1);
            assert_eq!(index.number(), Some(number));
        }
        assert_eq!(PageIndex::from(usize::MAX).number(), None);
    }
}
