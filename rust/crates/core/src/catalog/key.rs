//! カタログで検証するエントリ名。

/// 型・値を検証するカタログキー（他のキーは未解釈で保持する）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CatalogKey {
    /// カタログを識別する名前。
    Type,
    /// ページツリーのルート参照。
    Pages,
    /// カタログが宣言する版。
    Version,
    /// ページの配置。
    PageLayout,
    /// ビューアの表示モード。
    PageMode,
}

impl CatalogKey {
    /// 先頭の `/` を含まないキー名を返す。
    pub fn as_bytes(self) -> &'static [u8] {
        match self {
            Self::Type => b"Type",
            Self::Pages => b"Pages",
            Self::Version => b"Version",
            Self::PageLayout => b"PageLayout",
            Self::PageMode => b"PageMode",
        }
    }
}
