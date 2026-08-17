//! 暗号化辞書のキー名（ISO 32000-1:2008 §7.6.2 表 20 / §7.6.5 表 25、
//! `docs/specs/02b_encryption.md` §2・§4）。
//!
//! キー名の定義点は [`EncryptKey::as_str`] / [`CryptFilterKey::as_str`] ただ 1 箇所。
//! 辞書引きに使うバイト列もそこから導出する。バイト定数と表示用文字列を別々に持つと
//! 片方だけの綴り間違いを型検査で防げないため、enum に集約している
//! （`xref/trailer/key.rs` と同じ方針）。

/// 暗号化辞書のキー。
///
/// ここに無いキー（未知キー・将来追加されるキー）は解析時に無視される。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum EncryptKey {
    /// `/Filter` — セキュリティハンドラ名。必須。
    Filter,
    /// `/SubFilter` — ハンドラ固有のサブ形式。本実装では解釈しない。
    SubFilter,
    /// `/V` — アルゴリズム版。必須。
    V,
    /// `/R` — リビジョン。標準セキュリティハンドラで必須。
    R,
    /// `/Length` — ファイル暗号鍵の長さ（ビット）。既定 40。
    Length,
    /// `/CF` — crypt filter 辞書。`/V 4` 以降で必須。
    CF,
    /// `/StmF` — ストリームに適用する crypt filter 名。既定 `/Identity`。
    StmF,
    /// `/StrF` — 文字列に適用する crypt filter 名。既定 `/Identity`。
    StrF,
    /// `/EFF` — 埋め込みファイルストリームに適用する crypt filter 名。任意。
    EFF,
    /// `/O` — 所有者パスワードから導出した値。必須。
    O,
    /// `/U` — 利用者パスワードから導出した値。必須。
    U,
    /// `/OE` — 所有者用の暗号化ファイル鍵。`/R 5` `/R 6` で必須。
    OE,
    /// `/UE` — 利用者用の暗号化ファイル鍵。`/R 5` `/R 6` で必須。
    UE,
    /// `/P` — アクセス権限フラグ。必須。
    P,
    /// `/Perms` — 権限の暗号化コピー。`/R 5` `/R 6` で必須。
    Perms,
    /// `/EncryptMetadata` — メタデータを暗号化するか。既定 true。
    EncryptMetadata,
}

impl EncryptKey {
    /// PDF 上のキー名（先頭の `/` は含まない）を返す。
    ///
    /// キー名の**唯一の定義点**。綴りを変える場合はここだけを直せばよい。
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Filter => "Filter",
            Self::SubFilter => "SubFilter",
            Self::V => "V",
            Self::R => "R",
            Self::Length => "Length",
            Self::CF => "CF",
            Self::StmF => "StmF",
            Self::StrF => "StrF",
            Self::EFF => "EFF",
            Self::O => "O",
            Self::U => "U",
            Self::OE => "OE",
            Self::UE => "UE",
            Self::P => "P",
            Self::Perms => "Perms",
            Self::EncryptMetadata => "EncryptMetadata",
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

/// crypt filter 辞書（`/CF` の各エントリ）のキー。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CryptFilterKey {
    /// `/CFM` — 暗号方式。省略時は `/None` 扱い。
    CFM,
    /// `/AuthEvent` — 認証イベント。既定 `/DocOpen`。
    AuthEvent,
    /// `/Length` — 鍵長。ISO 32000-1 はバイト、実装によってはビットで書かれる。
    Length,
}

impl CryptFilterKey {
    /// PDF 上のキー名（先頭の `/` は含まない）を返す。
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::CFM => "CFM",
            Self::AuthEvent => "AuthEvent",
            Self::Length => "Length",
        }
    }

    /// 辞書引きに使うバイト列を返す。
    #[must_use]
    pub fn as_bytes(self) -> &'static [u8] {
        self.as_str().as_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::{CryptFilterKey, EncryptKey};

    // 暗号化辞書の各バリアントが PDF 仕様どおりのキー名を返すことを確認する
    #[test]
    fn encrypt_key_as_str_returns_pdf_key_name() {
        let cases: [(EncryptKey, &str); 16] = [
            (EncryptKey::Filter, "Filter"),
            (EncryptKey::SubFilter, "SubFilter"),
            (EncryptKey::V, "V"),
            (EncryptKey::R, "R"),
            (EncryptKey::Length, "Length"),
            (EncryptKey::CF, "CF"),
            (EncryptKey::StmF, "StmF"),
            (EncryptKey::StrF, "StrF"),
            (EncryptKey::EFF, "EFF"),
            (EncryptKey::O, "O"),
            (EncryptKey::U, "U"),
            (EncryptKey::OE, "OE"),
            (EncryptKey::UE, "UE"),
            (EncryptKey::P, "P"),
            (EncryptKey::Perms, "Perms"),
            (EncryptKey::EncryptMetadata, "EncryptMetadata"),
        ];
        for (key, expected) in cases {
            assert_eq!(key.as_str(), expected, "key: {key:?}");
        }
    }

    // crypt filter の各バリアントが PDF 仕様どおりのキー名を返すことを確認する
    #[test]
    fn crypt_filter_key_as_str_returns_pdf_key_name() {
        let cases: [(CryptFilterKey, &str); 3] = [
            (CryptFilterKey::CFM, "CFM"),
            (CryptFilterKey::AuthEvent, "AuthEvent"),
            (CryptFilterKey::Length, "Length"),
        ];
        for (key, expected) in cases {
            assert_eq!(key.as_str(), expected, "key: {key:?}");
        }
    }

    // 暗号化辞書の全キーで as_bytes が as_str と一致することを確認する
    #[test]
    fn encrypt_key_as_bytes_matches_as_str() {
        let keys: [EncryptKey; 16] = [
            EncryptKey::Filter,
            EncryptKey::SubFilter,
            EncryptKey::V,
            EncryptKey::R,
            EncryptKey::Length,
            EncryptKey::CF,
            EncryptKey::StmF,
            EncryptKey::StrF,
            EncryptKey::EFF,
            EncryptKey::O,
            EncryptKey::U,
            EncryptKey::OE,
            EncryptKey::UE,
            EncryptKey::P,
            EncryptKey::Perms,
            EncryptKey::EncryptMetadata,
        ];
        for key in keys {
            assert_eq!(key.as_bytes(), key.as_str().as_bytes(), "key: {key:?}");
        }
    }

    // crypt filter の全キーで as_bytes が as_str と一致することを確認する
    #[test]
    fn crypt_filter_key_as_bytes_matches_as_str() {
        let keys: [CryptFilterKey; 3] = [
            CryptFilterKey::CFM,
            CryptFilterKey::AuthEvent,
            CryptFilterKey::Length,
        ];
        for key in keys {
            assert_eq!(key.as_bytes(), key.as_str().as_bytes(), "key: {key:?}");
        }
    }
}
