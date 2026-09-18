//! `/DecodeParms` の `/Colors` パラメータ（色コンポーネント数）。

use std::num::NonZeroUsize;

/// 色コンポーネント数（1以上の正整数）。
///
/// PDF 仕様（ISO 32000-1:2008）における `/Colors` パラメータを表す。
/// デフォルト値は 1（グレースケール）。
/// 0 を型レベルで排除し、引数の取り違えを防止する newtype。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct Colors(pub(crate) NonZeroUsize);

impl Colors {
    /// 指定された [`NonZeroUsize`] から [`Colors`] を構築する。
    #[inline]
    #[must_use]
    pub const fn new(value: NonZeroUsize) -> Self {
        Self(value)
    }

    /// デフォルト値（1 = グレースケール）の [`Colors`] を返す。
    #[inline]
    #[must_use]
    pub const fn one() -> Self {
        Self(NonZeroUsize::MIN)
    }

    /// `usize` 値から [`Colors`] を構築する。`0` の場合は `None` を返す。
    #[inline]
    #[must_use]
    pub const fn from_usize(value: usize) -> Option<Self> {
        match NonZeroUsize::new(value) {
            Some(nz) => Some(Self(nz)),
            None => None,
        }
    }

    /// 保持する [`NonZeroUsize`] 値を取得する。
    #[inline]
    #[must_use]
    pub const fn get(self) -> NonZeroUsize {
        self.0
    }
}
