//! 印刷時のトラッピング（色版のずれを補う処理）の状態。

/// Trapped の名前。省略と未知の名前は Unknown。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub enum Trapped {
    /// トラッピング済み。
    True,
    /// トラッピング未実施。
    False,
    /// トラッピング状態は不明。
    #[default]
    Unknown,
}

impl Trapped {
    /// 名前バイト列を解釈する。未知の名前は Unknown に落とす。
    pub fn from_bytes(bytes: &[u8]) -> Self {
        match bytes {
            b"True" => Self::True,
            b"False" => Self::False,
            b"Unknown" => Self::Unknown,
            _ => Self::Unknown,
        }
    }
}
