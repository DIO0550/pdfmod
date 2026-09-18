//! `/DecodeParms` 辞書で使用される既知のキー。

/// `/DecodeParms` 辞書の既知キー。
///
/// 文字列リテラルの散在を防ぎ、辞書パーサでのキー参照を一元化する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum DecodeParmsKey {
    /// 予測アルゴリズムの種別。
    Predictor,
    /// カラーコンポーネント数（デフォルト 1）。
    Colors,
    /// 1コンポーネントあたりのビット数（デフォルト 8）。
    BitsPerComponent,
    /// 1行あたりのサンプル数（デフォルト 1）。
    Columns,
    /// LZW フィルタ固有の符号長切り替えタイミング（デフォルト 1）。
    EarlyChange,
}

impl DecodeParmsKey {
    /// PDF 名（`/` なしの文字列）を返す。
    #[inline]
    #[must_use]
    pub const fn as_str(self) -> &'static str {
        match self {
            Self::Predictor => "Predictor",
            Self::Colors => "Colors",
            Self::BitsPerComponent => "BitsPerComponent",
            Self::Columns => "Columns",
            Self::EarlyChange => "EarlyChange",
        }
    }

    /// PDF 名のバイト列表現を返す。
    #[inline]
    #[must_use]
    pub const fn as_bytes(self) -> &'static [u8] {
        self.as_str().as_bytes()
    }
}
