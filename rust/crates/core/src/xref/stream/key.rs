//! xref ストリーム辞書キーを定義するモジュール。

/// xref ストリーム辞書で使用される主要キー。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum XRefStreamKey {
    /// `/Type`
    Type,
    /// `/Size`
    Size,
    /// `/Index`
    Index,
    /// `/W`
    W,
    /// `/Filter`
    Filter,
    /// `/DecodeParms`
    DecodeParms,
}

impl XRefStreamKey {
    /// キーの名前（先頭スラッシュなし）を取得する。
    #[inline]
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Type => "Type",
            Self::Size => "Size",
            Self::Index => "Index",
            Self::W => "W",
            Self::Filter => "Filter",
            Self::DecodeParms => "DecodeParms",
        }
    }

    /// キーの名前のバイト列を取得する。
    #[inline]
    #[must_use]
    pub const fn as_bytes(self) -> &'static [u8] {
        self.as_str().as_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_str_and_as_bytes() {
        assert_eq!(XRefStreamKey::Type.as_str(), "Type");
        assert_eq!(XRefStreamKey::Type.as_bytes(), b"Type");
        assert_eq!(XRefStreamKey::Size.as_str(), "Size");
        assert_eq!(XRefStreamKey::Index.as_str(), "Index");
        assert_eq!(XRefStreamKey::W.as_str(), "W");
        assert_eq!(XRefStreamKey::Filter.as_str(), "Filter");
        assert_eq!(XRefStreamKey::DecodeParms.as_str(), "DecodeParms");
    }
}
