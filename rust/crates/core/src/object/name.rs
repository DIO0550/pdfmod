//! PDF 名前オブジェクト (`/Name`) を表す `PdfName` を定義するモジュール。
//!
//! 裸の `Vec<u8>` と取り違えないための newtype。辞書キー・フィルタ名・
//! リソース名などの構成要素として用いる。`#XX` 16進エスケープのデコードは
//! レクサー（Epic R1）の責務であり、本型は**デコード後**の名前本体バイト列を
//! 保持する（`/` 接頭辞は含めない）。生成は無検証（infallible）で、空名や
//! NUL・非UTF-8 を含む任意のバイト列も無条件に受理する。名前の妥当性検証は
//! 上位レイヤ（パーサ／オブジェクト層）に委譲する。

use std::borrow::Borrow;

/// PDF 名前オブジェクト。名前本体のバイト列を保持するラッパ。
///
/// 内部表現は `Vec<u8>`（Issue #261 指定）。`#XX` デコード後は NUL (`0x00`) や
/// 非UTF-8 (`0x80`) など任意の8ビット値を含みうるため、UTF-8 前提の `String`
/// ではなくバイト列で保持する。ヒープ確保を伴うため `Copy` は不可（既存 newtype
/// 3兄弟と異なり `Copy` を derive しない）。複製が必要な場合は `clone()` を使う。
/// 等価・順序・ハッシュは内部 `Vec<u8>` の自然な振る舞い（バイト列の辞書順／
/// 完全一致）に従う。
#[derive(Debug, Clone, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
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
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.0
    }

    /// 内部の名前を `&str` として取り出す。
    ///
    /// UTF-8 として解釈できる場合のみ `Some(&str)` を返し、非UTF-8 バイトを含む
    /// 場合は `None` を返す（panic しない）。空名は `Some("")` を返す。
    #[must_use]
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

impl From<String> for PdfName {
    /// 所有された `String` から `PdfName` を生成する変換経路。
    ///
    /// `into_bytes()` によりバッファをそのままムーブするため、`From<&str>` の
    /// `to_vec()` と違ってコピーが発生しない。UTF-8 妥当性の検査はしない
    /// （`String` は常に妥当な UTF-8 であり、本型はさらに広いバイト列を受理する）。
    fn from(s: String) -> PdfName {
        PdfName(s.into_bytes())
    }
}

impl From<Vec<u8>> for PdfName {
    /// 所有されたバイト列から `PdfName` を生成する変換経路。
    ///
    /// レクサーが `#XX` デコード後に組み立てた `Vec<u8>` をそのままムーブで受け取る
    /// 想定の主経路。無検証（infallible）であり、空バイト列・NUL・非 UTF-8 バイトを
    /// 無条件に受理する（`new` と同一の契約）。
    fn from(bytes: Vec<u8>) -> PdfName {
        PdfName(bytes)
    }
}

impl From<&[u8]> for PdfName {
    /// 借用したバイトスライスから `PdfName` を生成する変換経路（1 回コピーする）。
    ///
    /// なお `From` にはデリファレンス強制が効かないため、`b"Length"`（`&[u8; N]`）や
    /// `&Vec<u8>` は本 impl では受理できない。バイト列リテラルからは `new(b"Length")`
    /// を使うか、`b"Length".as_slice()` のようにスライスへ明示的に変換する。
    /// `From<&[u8; N]>` は今回実装しないが、後から非破壊で追加できる。
    fn from(bytes: &[u8]) -> PdfName {
        PdfName(bytes.to_vec())
    }
}

impl Borrow<[u8]> for PdfName {
    /// 名前本体を `&[u8]` として借用し、`BTreeMap` / `HashMap` のキー引きを
    /// バイト列で行えるようにする。
    ///
    /// これにより `PdfDictionary::get` 等が `dict.get(b"Length".as_slice())` の形で
    /// 呼べるようになり、ルックアップのたびに一時 `PdfName`（`Vec<u8>`）を確保する
    /// 必要がなくなる（#386）。
    ///
    /// `Borrow` は「借用の前後で `Eq` / `Ord` / `Hash` が一致する」ことを実装者の
    /// 責務として要求する。`PdfName` の `Eq` / `Ord` / `Hash` はいずれも derive による
    /// 単一フィールドへの委譲であり、`Vec<u8>` はさらに `[u8]` へ委譲するため、
    /// この契約は定義上満たされる。`BTreeMap` は `Ord` が食い違ってもエラーにならず
    /// 静かに誤った結果を返すため、この一致が正しさの前提になる。
    ///
    /// なお `b"Length"` は `&[u8; 6]` であり、`Borrow<[u8; N]>` は `&self` から
    /// 固定長配列参照を返せないため実装できない。呼び出し側は
    /// `b"Length".as_slice()` のように `&[u8]` へ明示的に落とすこと。
    fn borrow(&self) -> &[u8] {
        self.as_bytes()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::hash_map::DefaultHasher;
    use std::collections::HashMap;
    use std::collections::HashSet;
    use std::hash::{Hash, Hasher};

    #[test]
    fn borrow_returns_name_bytes() {
        // PdfName を Borrow<[u8]> で借用すると名前本体のバイト列を返すことを確認する
        let name = PdfName::from("Type");
        assert_eq!(Borrow::<[u8]>::borrow(&name), b"Type");
    }

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
    fn from_string_builds_name() {
        // 所有された String から From で生成すると as_bytes がそのバイト列に一致することを確認する
        assert_eq!(PdfName::from(String::from("Type")).as_bytes(), b"Type");
    }

    #[test]
    fn from_vec_u8_builds_name() {
        // 所有された Vec<u8> から From で生成すると as_bytes がそのバイト列に一致することを確認する
        assert_eq!(PdfName::from(b"Type".to_vec()).as_bytes(), b"Type");
    }

    #[test]
    fn from_slice_builds_name() {
        // 借用バイトスライスから From で生成すると as_bytes がそのバイト列に一致することを確認する
        let bytes = b"Type".to_vec();
        assert_eq!(PdfName::from(bytes.as_slice()).as_bytes(), b"Type");
    }

    #[test]
    fn from_slice_matches_from_vec() {
        // 借用経路と所有経路が同一の PdfName を作ることを確認する
        let bytes = b"Type".to_vec();
        assert_eq!(
            PdfName::from(bytes.as_slice()),
            PdfName::from(bytes.clone())
        );
    }

    #[test]
    fn from_empty_slice_builds_empty_name() {
        // 空スライスを無検証で受理し as_bytes が空になることを確認する
        let empty: &[u8] = &[];
        assert!(PdfName::from(empty).as_bytes().is_empty());
    }

    #[test]
    fn from_slice_preserves_nul_byte() {
        // #00 デコード結果の NUL バイトが借用経路でも無検証に保持されることを確認する
        let bytes: &[u8] = &[0x00];
        assert_eq!(PdfName::from(bytes).as_bytes(), &[0x00]);
    }

    #[test]
    fn from_slice_preserves_non_utf8_byte() {
        // 非 UTF-8 バイト（0x80）が借用経路でも保持され、as_str が None を返すことを確認する
        let bytes: &[u8] = &[0x80];
        let name = PdfName::from(bytes);
        assert_eq!(name.as_bytes(), &[0x80]);
        assert_eq!(name.as_str(), None);
    }

    #[test]
    fn from_byte_literal_slice_builds_name() {
        // b"..."（&[u8; N]）は From に deref 強制が効かず直接渡せないため、
        // .as_slice() を挟む回避策が機能することを確認する
        assert_eq!(PdfName::from(b"Length".as_slice()).as_bytes(), b"Length");
    }

    #[test]
    fn from_vec_reference_requires_as_slice() {
        // &Vec<u8> も deref 強制が効かず From では受理されないため、
        // .as_slice() を挟む回避策が所有経路と等価になることを確認する
        let bytes = b"Length".to_vec();
        assert_eq!(
            PdfName::from(bytes.as_slice()),
            PdfName::from(bytes.clone())
        );
    }

    #[test]
    fn from_vec_matches_new() {
        // 新設 From<Vec<u8>> と既存 new が同一の PdfName を作ることを確認する
        assert_eq!(
            PdfName::from(b"Type".to_vec()),
            PdfName::new(b"Type".to_vec())
        );
    }

    #[test]
    fn from_empty_vec_builds_empty_name() {
        // 空 Vec<u8> を無検証で受理し as_bytes が空になることを確認する
        assert!(PdfName::from(Vec::new()).as_bytes().is_empty());
    }

    #[test]
    fn from_vec_preserves_nul_byte() {
        // #00 デコード結果の NUL バイトが所有経路で無検証に保持されることを確認する
        assert_eq!(PdfName::from(vec![0x00]).as_bytes(), &[0x00]);
    }

    #[test]
    fn from_vec_preserves_non_utf8_byte() {
        // 非 UTF-8 バイト（0x80）が所有経路で保持され、as_str が None を返すことを確認する
        let name = PdfName::from(vec![0x80]);
        assert_eq!(name.as_bytes(), &[0x80]);
        assert_eq!(name.as_str(), None);
    }

    #[test]
    fn from_string_matches_from_str() {
        // String 経路と既存 &str 経路が同一の PdfName を作ることを確認する
        assert_eq!(PdfName::from(String::from("Type")), PdfName::from("Type"));
    }

    #[test]
    fn from_empty_string_builds_empty_name() {
        // 空 String（PDF 仕様上有効な空名 `/`）を無検証で受理し as_bytes が空になることを確認する
        assert!(PdfName::from(String::new()).as_bytes().is_empty());
    }

    #[test]
    fn from_string_preserves_multibyte_utf8() {
        // 多バイト UTF-8（日本語）の名前が String 経路でも忠実に保持されることを確認する
        assert_eq!(PdfName::from(String::from("名前")).as_str(), Some("名前"));
    }

    #[test]
    fn from_string_preserves_nul_byte() {
        // String も NUL を保持できるため、String 経路でも無検証で NUL が残ることを確認する
        assert_eq!(PdfName::from(String::from("\u{0}")).as_bytes(), &[0x00]);
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

    #[test]
    fn borrow_matches_as_bytes() {
        // 同じ PdfName の borrow と as_bytes が同じバイト列を返すことを確認する
        let name = PdfName::from("Type");
        assert_eq!(Borrow::<[u8]>::borrow(&name), name.as_bytes());
    }

    #[test]
    fn borrowed_equality_matches_name_equality() {
        // 等しい名前と異なる名前の両方で PdfName と借用後バイト列の等価性が一致することを確認する
        let left = PdfName::from("Type");
        let equal = PdfName::from("Type");
        let different = PdfName::from("Page");
        assert_eq!(
            left == equal,
            Borrow::<[u8]>::borrow(&left) == Borrow::<[u8]>::borrow(&equal)
        );
        assert_eq!(
            left == different,
            Borrow::<[u8]>::borrow(&left) == Borrow::<[u8]>::borrow(&different)
        );
    }

    #[test]
    fn borrowed_ordering_matches_name_ordering() {
        // 借用前後の名前を昇順の隣接ペアで比較し Ord の結果が一致することを確認する
        let names = [
            PdfName::from(""),
            PdfName::from("A"),
            PdfName::from("AB"),
            PdfName::from("B"),
        ];
        for pair in names.windows(2) {
            assert_eq!(
                pair[0].cmp(&pair[1]),
                Borrow::<[u8]>::borrow(&pair[0]).cmp(Borrow::<[u8]>::borrow(&pair[1]))
            );
        }
    }

    #[test]
    fn borrowed_hash_matches_name_hash() {
        // PdfName と借用後バイト列を同じ方式でハッシュすると同じ値になることを確認する
        let name = PdfName::from("Type");
        let mut name_hasher = DefaultHasher::new();
        name.hash(&mut name_hasher);
        let mut borrowed_hasher = DefaultHasher::new();
        Borrow::<[u8]>::borrow(&name).hash(&mut borrowed_hasher);
        assert_eq!(name_hasher.finish(), borrowed_hasher.finish());
    }

    #[test]
    fn borrow_returns_empty_slice_for_empty_name() {
        // 空の PdfName を借用すると空のバイトスライスを返すことを確認する
        let name = PdfName::from("");
        assert_eq!(Borrow::<[u8]>::borrow(&name), b"");
    }

    #[test]
    fn borrow_preserves_non_utf8_bytes() {
        // NUL と非 UTF-8 を含む PdfName を借用しても全バイトがそのまま保持されることを確認する
        let bytes = vec![0x00, 0x80, 0xFF];
        let name = PdfName::new(bytes.clone());
        assert_eq!(Borrow::<[u8]>::borrow(&name), bytes.as_slice());
    }
}
