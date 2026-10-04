//! ページ境界ボックスの辞書キー。

/// ページ境界の種類。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PageBoxKey {
    /// 物理メディア。
    MediaBox,
    /// 表示・印刷範囲。
    CropBox,
    /// 裁ち落とし範囲。
    BleedBox,
    /// 仕上がり範囲。
    TrimBox,
    /// 意味のあるコンテンツの範囲。
    ArtBox,
}

impl PageBoxKey {
    /// 先頭の / を除いた辞書キー。
    pub fn as_bytes(self) -> &'static [u8] {
        match self {
            Self::MediaBox => b"MediaBox",
            Self::CropBox => b"CropBox",
            Self::BleedBox => b"BleedBox",
            Self::TrimBox => b"TrimBox",
            Self::ArtBox => b"ArtBox",
        }
    }
}
