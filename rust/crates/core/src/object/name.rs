//! PDF 名前オブジェクト (`/Name`) を表す `PdfName` を定義するモジュール。
//!
//! 裸の `Vec<u8>` と取り違えないための newtype。辞書キー・フィルタ名・
//! リソース名などの構成要素として用いる。`#XX` 16進エスケープのデコードは
//! レクサー（Epic R1）の責務であり、本型は**デコード後**の名前本体バイト列を
//! 保持する（`/` 接頭辞は含めない）。生成は無検証（infallible）で、空名や
//! NUL・非UTF-8 を含む任意のバイト列も無条件に受理する。名前の妥当性検証は
//! 上位レイヤ（パーサ／オブジェクト層）に委譲する。

/// PDF 名前オブジェクト。名前本体のバイト列を保持するラッパ。
///
/// 内部表現は `Vec<u8>`（Issue #261 指定）。`#XX` デコード後は NUL (`0x00`) や
/// 非UTF-8 (`0x80`) など任意の8ビット値を含みうるため、UTF-8 前提の `String`
/// ではなくバイト列で保持する。ヒープ確保を伴うため `Copy` は不可（既存 newtype
/// 3兄弟と異なり `Copy` を derive しない）。複製が必要な場合は `clone()` を使う。
/// 等価・順序・ハッシュは内部 `Vec<u8>` の自然な振る舞い（バイト列の辞書順／
/// 完全一致）に従う。
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct PdfName(Vec<u8>);

impl PdfName {
    /// 与えられたバイト列から `PdfName` を生成する。
    ///
    /// 無検証（infallible）。空のバイト列や NUL・非UTF-8 を含む任意のバイト列を
    /// 無条件に受理する。呼び出し側が**デコード済み**バイト列を渡す契約であり、
    /// 本型は `#XX` デコードも妥当性検証も行わない（検証は lexer/parser 層に委譲）。
    pub fn new(bytes: impl Into<Vec<u8>>) -> PdfName {
        PdfName(bytes.into())
    }

    /// 内部の名前本体を `&[u8]`（バイトスライス）として取り出す。
    ///
    /// バイト列をそのまま返すため、非UTF-8 バイトを含む名前も忠実に扱える。
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// 内部の名前を `&str` として取り出す。
    ///
    /// UTF-8 として解釈できる場合のみ `Some(&str)` を返し、非UTF-8 バイトを含む
    /// 場合は `None` を返す（panic しない）。空名は `Some("")` を返す。
    pub fn as_str(&self) -> Option<&str> {
        std::str::from_utf8(&self.0).ok()
    }
}

impl From<&str> for PdfName {
    /// `&str` リテラルから `PdfName` を生成する ergonomic な構築経路。
    ///
    /// `new(impl Into<Vec<u8>>)` でも `PdfName::new("Type")` のように構築できるが、
    /// 本 `From<&str>` は `PdfName::from("Type")` / `.into()` という慣習的な変換経路を
    /// 提供する目的で実装する（唯一の文字列構築経路ではない）。
    /// 例: `PdfName::from("Type")` の `as_bytes()` は `b"Type"` と一致する。
    fn from(s: &str) -> PdfName {
        PdfName(s.as_bytes().to_vec())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::collections::HashSet;

    #[test]
    fn new_then_as_bytes_roundtrips() {
        // new に渡したバイト列が as_bytes でそのまま取り出せることを確認する
        let name = PdfName::new(b"Type".to_vec());
        assert_eq!(name.as_bytes(), b"Type");
    }

    #[test]
    fn from_str_builds_name() {
        // &str リテラルから From で生成すると as_bytes がそのバイト列に一致することを確認する
        assert_eq!(PdfName::from("Type").as_bytes(), b"Type");
    }

    #[test]
    fn clone_preserves_bytes_and_equals_original() {
        // Copy ではなく Clone で複製でき、複製のバイト列が元と一致し == で等価になることを確認する
        let original = PdfName::from("Type");
        let cloned = original.clone();
        assert_eq!(cloned.as_bytes(), original.as_bytes());
        assert_eq!(cloned, original);
    }

    #[test]
    fn as_str_returns_some_for_ascii() {
        // ASCII 名は as_str で Some(&str) として読み取れることを確認する
        assert_eq!(PdfName::from("Type").as_str(), Some("Type"));
    }

    #[test]
    fn as_str_returns_some_for_multibyte_utf8() {
        // 多バイトUTF-8（日本語）の名前も UTF-8 として妥当なら Some を返すことを確認する
        assert_eq!(PdfName::from("名前").as_str(), Some("名前"));
    }

    #[test]
    fn empty_name_has_empty_bytes() {
        // 空名（PDF 仕様上有効な空名 `/`）を無検証で受理し as_bytes が空になることを確認する
        let name = PdfName::new(Vec::new());
        assert!(name.as_bytes().is_empty());
    }

    #[test]
    fn empty_name_as_str_is_some_empty() {
        // 空名の as_str は空文字列で Some("") を返すことを確認する
        assert_eq!(PdfName::new(Vec::new()).as_str(), Some(""));
    }

    #[test]
    fn preserves_nul_byte() {
        // NUL バイト（#00 デコード結果）を無検証で忠実に保持することを確認する
        assert_eq!(PdfName::new(vec![0x00]).as_bytes(), &[0x00]);
    }

    #[test]
    fn preserves_non_utf8_byte() {
        // 非UTF-8 バイト（0x80）を無検証で忠実に保持することを確認する
        assert_eq!(PdfName::new(vec![0x80]).as_bytes(), &[0x80]);
    }

    #[test]
    fn as_str_returns_none_for_non_utf8_byte() {
        // 非UTF-8 の単独バイト（0x80）の as_str は panic せず None を返すことを確認する
        assert_eq!(PdfName::new(vec![0x80]).as_str(), None);
    }

    #[test]
    fn as_str_returns_none_for_invalid_multibyte_sequence() {
        // 不正なマルチバイト UTF-8 列（0xC0 0x80）の as_str も安全に None を返すことを確認する
        assert_eq!(PdfName::new(vec![0xC0, 0x80]).as_str(), None);
    }

    #[test]
    fn equal_names_are_equal() {
        // 同一バイト列から生成した 2 つの PdfName が == で等価になることを確認する
        assert_eq!(PdfName::from("Type"), PdfName::from("Type"));
    }

    #[test]
    fn different_names_are_not_equal() {
        // 異なるバイト列から生成した 2 つの PdfName が != で非等価になることを確認する
        assert_ne!(PdfName::from("Type"), PdfName::from("Font"));
    }

    #[test]
    fn orders_by_inner_bytes() {
        // 順序はバイト列の辞書順（"A" < "B"）に従うことを確認する
        assert!(PdfName::from("A") < PdfName::from("B"));
        assert!(PdfName::from("B") > PdfName::from("A"));
    }

    #[test]
    fn sorts_in_ascending_byte_order() {
        // 順不同の PdfName 配列を sort するとバイト列辞書順の昇順に並ぶことを確認する
        let mut names = [PdfName::from("C"), PdfName::from("A"), PdfName::from("B")];
        names.sort();
        assert_eq!(
            names,
            [PdfName::from("A"), PdfName::from("B"), PdfName::from("C")]
        );
    }

    #[test]
    fn works_as_hash_map_key() {
        // HashMap のキーとして使え、同値の別インスタンスへの参照で挿入値を取得できることを確認する
        let mut map = HashMap::new();
        map.insert(PdfName::from("Type"), "catalog");
        assert_eq!(map.get(&PdfName::from("Type")), Some(&"catalog"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値 PdfName を HashSet に 2 回挿入すると要素数が 1 に畳まれることを確認する
        let mut set = HashSet::new();
        set.insert(PdfName::from("Type"));
        set.insert(PdfName::from("Type"));
        assert_eq!(set.len(), 1);
    }
}
