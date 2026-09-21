//! オブジェクトストリーム辞書のキー定義（ISO 32000-1 §7.5.7）。

/// オブジェクトストリーム辞書で使用されるキー（ISO 32000-1 §7.5.7）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ObjectStreamKey {
    /// `/Type`（必須、`/ObjStm`）
    Type,
    /// `/N`（必須、ストリーム内のオブジェクト数）
    N,
    /// `/First`（必須、オブジェクトデータ領域の開始バイトオフセット）
    First,
    /// `/Extends`（任意、拡張元のオブジェクトストリーム間接参照）
    Extends,
    /// `/Filter`（任意、復号フィルタ名）
    Filter,
    /// `/DecodeParms`（任意、フィルタパラメータ）
    DecodeParms,
    /// `/Length`（必須、ストリームデータのバイト長）
    Length,
}

impl ObjectStreamKey {
    /// PDF 名としてのバイト列表現を取得する（スラッシュを含まない）。
    #[inline]
    #[must_use]
    pub const fn as_bytes(self) -> &'static [u8] {
        match self {
            Self::Type => b"Type",
            Self::N => b"N",
            Self::First => b"First",
            Self::Extends => b"Extends",
            Self::Filter => b"Filter",
            Self::DecodeParms => b"DecodeParms",
            Self::Length => b"Length",
        }
    }

    /// PDF 名としての文字列表現を取得する。
    #[inline]
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Type => "Type",
            Self::N => "N",
            Self::First => "First",
            Self::Extends => "Extends",
            Self::Filter => "Filter",
            Self::DecodeParms => "DecodeParms",
            Self::Length => "Length",
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn as_bytes_and_as_str_match() {
        let keys = [
            (ObjectStreamKey::Type, b"Type".as_slice(), "Type"),
            (ObjectStreamKey::N, b"N".as_slice(), "N"),
            (ObjectStreamKey::First, b"First".as_slice(), "First"),
            (ObjectStreamKey::Extends, b"Extends".as_slice(), "Extends"),
            (ObjectStreamKey::Filter, b"Filter".as_slice(), "Filter"),
            (
                ObjectStreamKey::DecodeParms,
                b"DecodeParms".as_slice(),
                "DecodeParms",
            ),
            (ObjectStreamKey::Length, b"Length".as_slice(), "Length"),
        ];

        for (key, expected_bytes, expected_str) in keys {
            assert_eq!(key.as_bytes(), expected_bytes);
            assert_eq!(key.as_str(), expected_str);
        }
    }
}
