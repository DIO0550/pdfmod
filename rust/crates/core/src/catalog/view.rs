//! カタログのページ配置・表示モード（docs/specs/03_document_architecture.md §2.3–2.4）。

/// ページ配置。省略時と未知の名前は SinglePage。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum PageLayout {
    /// 1ページずつ表示。
    #[default]
    SinglePage,
    /// 単一列の連続表示。
    OneColumn,
    /// 奇数ページが左の2列表示。
    TwoColumnLeft,
    /// 奇数ページが右の2列表示。
    TwoColumnRight,
    /// 奇数ページが左の見開き表示。
    TwoPageLeft,
    /// 奇数ページが右の見開き表示。
    TwoPageRight,
}

impl PageLayout {
    /// 名前バイト列を解釈する。未知の名前は仕様の既定値に落とす。
    pub fn from_bytes(bytes: &[u8]) -> Self {
        match bytes {
            b"SinglePage" => Self::SinglePage,
            b"OneColumn" => Self::OneColumn,
            b"TwoColumnLeft" => Self::TwoColumnLeft,
            b"TwoColumnRight" => Self::TwoColumnRight,
            b"TwoPageLeft" => Self::TwoPageLeft,
            b"TwoPageRight" => Self::TwoPageRight,
            _ => Self::default(),
        }
    }
}

/// ビューアの表示モード。省略時と未知の名前は UseNone。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum PageMode {
    /// 補助パネルを表示しない。
    #[default]
    UseNone,
    /// しおりパネル。
    UseOutlines,
    /// サムネイルパネル。
    UseThumbs,
    /// 全画面表示。
    FullScreen,
    /// オプショナルコンテンツパネル。
    UseOC,
    /// 添付ファイルパネル。
    UseAttachments,
}

impl PageMode {
    /// 名前バイト列を解釈する。未知の名前は仕様の既定値に落とす。
    pub fn from_bytes(bytes: &[u8]) -> Self {
        match bytes {
            b"UseNone" => Self::UseNone,
            b"UseOutlines" => Self::UseOutlines,
            b"UseThumbs" => Self::UseThumbs,
            b"FullScreen" => Self::FullScreen,
            b"UseOC" => Self::UseOC,
            b"UseAttachments" => Self::UseAttachments,
            _ => Self::default(),
        }
    }
}
