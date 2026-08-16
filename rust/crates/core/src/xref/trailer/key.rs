//! 従来形式トレイラの主要キー（ISO 32000-1:2008 §7.5.5 表 15、
//! `docs/specs/02_file_structure.md` §5.3）。
//!
//! キー名の定義点はこのモジュールの [`TrailerKey::as_str`] ただ 1 箇所。
//! 辞書引きに使うバイト列（[`TrailerKey::as_bytes`]）もそこから導出する。
//! バイト定数と表示用文字列を別々に持つと、片方だけの綴り間違いを
//! 型検査で防げないため、enum に集約している。

/// 本実装が取り出す対象とするトレイラのキー。
///
/// ここに無いキー（未知キー・将来追加されるキー）は解析時に無視される。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TrailerKey {
    /// `/Size` — 最大オブジェクト番号 + 1。必須。
    Size,
    /// `/Root` — ドキュメントカタログへの間接参照。必須。
    Root,
    /// `/Prev` — 直前の xref セクションのバイトオフセット。
    Prev,
    /// `/XRefStm` — ハイブリッド参照ファイルの xref ストリームのバイトオフセット。
    XRefStm,
    /// `/Info` — 文書情報辞書への間接参照。
    Info,
    /// `/ID` — ファイル識別子（永続 ID と変更 ID のペア）。
    ///
    /// バリアント名は Rust の命名規約に従い `Id` だが、
    /// PDF のキー名は `ID`（[`Self::as_str`] が返す値を参照）。
    Id,
    /// `/Encrypt` — 暗号化辞書、またはその間接参照。
    Encrypt,
}

impl TrailerKey {
    /// PDF 上のキー名（先頭の `/` は含まない）を返す。
    ///
    /// キー名の**唯一の定義点**。辞書引き用のバイト列も表示用の文字列も
    /// ここから導出するため、綴りを変える場合はここだけを直せばよい。
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Size => "Size",
            Self::Root => "Root",
            Self::Prev => "Prev",
            Self::XRefStm => "XRefStm",
            Self::Info => "Info",
            Self::Id => "ID",
            Self::Encrypt => "Encrypt",
        }
    }

    /// 辞書引きに使うバイト列を返す。
    ///
    /// `PdfDictionary::get` / `remove` は `PdfName: Borrow<[u8]>` により
    /// `&[u8]` で引けるため、一時 `PdfName` のヒープ確保が発生しない（#386）。
    #[must_use]
    pub fn as_bytes(self) -> &'static [u8] {
        self.as_str().as_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::TrailerKey;

    // 各バリアントが PDF 仕様どおりのキー名を返すことを確認する
    #[test]
    fn as_str_returns_pdf_key_name() {
        let cases: [(TrailerKey, &str); 7] = [
            (TrailerKey::Size, "Size"),
            (TrailerKey::Root, "Root"),
            (TrailerKey::Prev, "Prev"),
            (TrailerKey::XRefStm, "XRefStm"),
            (TrailerKey::Info, "Info"),
            (TrailerKey::Id, "ID"),
            (TrailerKey::Encrypt, "Encrypt"),
        ];
        for (key, expected) in cases {
            assert_eq!(key.as_str(), expected, "key: {key:?}");
        }
    }

    // Id バリアントだけバリアント名とキー名が一致しない（Id / "ID"）ことを固定する
    #[test]
    fn id_variant_maps_to_uppercase_key_name() {
        assert_eq!(TrailerKey::Id.as_str(), "ID");
        assert_eq!(TrailerKey::Id.as_bytes(), b"ID");
    }

    // as_bytes が as_str と同じ内容を返す（定義点が 1 つである）ことを確認する
    #[test]
    fn as_bytes_matches_as_str() {
        let keys = [
            TrailerKey::Size,
            TrailerKey::Root,
            TrailerKey::Prev,
            TrailerKey::XRefStm,
            TrailerKey::Info,
            TrailerKey::Id,
            TrailerKey::Encrypt,
        ];
        for key in keys {
            assert_eq!(key.as_bytes(), key.as_str().as_bytes(), "key: {key:?}");
        }
    }
}
