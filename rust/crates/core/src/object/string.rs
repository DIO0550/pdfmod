//! PDF 文字列オブジェクトを表す `PdfString` を定義するモジュール。
//!
//! 復号後のバイト列と、元の表記形式（リテラル `(...)` / 16進 `<...>`）を表す
//! `StringEncoding` の組。エスケープ解決や 16 進デコードはレクサー（Epic R1）の
//! 責務であり、本型は**デコード後**のバイト列を保持する（`PdfName` と同方針）。
//! 生成は無検証（infallible）で、空バイト列や NUL・非UTF-8 を含む任意のバイト列も
//! 無条件に受理する。妥当性検証は上位レイヤに委譲する。
//!
//! 表記形式を保持するのは PDF を忠実に書き戻すため。ただし保持するのは
//! 「リテラルか16進か」の識別子だけで、原文のバイト列（どのエスケープを選んだか・
//! 16 進の大小文字・奇数桁など）は保持しない。再シリアライズは規定のルールで
//! 表記を再生成する方式とし、バイト等価は保証するが原文完全一致は保証しない。
//!
//! 本モジュールは Issue #385 で追加された PDF オブジェクト層の型。

/// PDF 文字列オブジェクトの元の表記形式（ISO 32000-1 §7.3.4）。
///
/// データを持たないフィールドレス enum のため `Copy` を derive する
/// （`ObjectKind` と同方針）。`Ord` は付けない（リテラルと16進の間に
/// 意味のある順序はない）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[must_use]
pub enum StringEncoding {
    /// リテラル文字列 `(...)`（ISO 32000-1 §7.3.4.2）。
    Literal,
    /// 16 進文字列 `<...>`（ISO 32000-1 §7.3.4.3）。
    Hex,
}

/// PDF 文字列オブジェクト。**復号後**のバイト列と元の表記形式を保持する。
///
/// 内部表現は `Vec<u8>`。デコード後は NUL (`0x00`) や非UTF-8 (`0x80`) など
/// 任意の8ビット値を含みうるため、UTF-8 前提の `String` ではなくバイト列で保持する。
/// ヒープ確保を伴うため `Copy` は不可（複製が必要な場合は `clone()` を使う）。
/// 浮動小数点を含まないため `Eq`/`Hash` は derive できる（`PdfName` と同方針）。
/// `Ord` は付けない — `PdfName` が `Ord` を持つのは辞書キーとしてソートされるためだが
/// 本型にその用途はなく、`(bytes, encoding)` の辞書式順序は「同じバイト列なら
/// Literal が Hex より前」という意味のない順序になる（必要時に非破壊で追加可能）。
/// 「空バイト列 + 既定 encoding」を量産する意味が薄いため `Default` も付けない
/// （`PdfStream` と同方針）。よって derive は `Debug, Clone, PartialEq, Eq, Hash`。
///
/// 同じバイト列でも `encoding` が異なれば `==` で非等価になる
/// （`Primitive::LiteralString` / `HexString` がトークン層で持つ性質を維持する）。
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
#[must_use]
pub struct PdfString {
    bytes: Vec<u8>,
    encoding: StringEncoding,
}

impl PdfString {
    /// 復号後バイト列と表記形式から `PdfString` を生成する。
    ///
    /// 無検証（infallible）。空バイト列・NUL・非UTF-8/高位バイトを含む任意の
    /// バイト列を無条件に受理する。`bytes` は `impl Into<Vec<u8>>` 受け
    /// （`PdfName::new` と同方針。`b"..."` を直接渡せる）。`Vec<u8>` 入力は
    /// ムーブ格納でコピーなし、スライス・配列参照入力は所有化のコピーが 1 回発生する。
    pub fn new(bytes: impl Into<Vec<u8>>, encoding: StringEncoding) -> Self {
        Self {
            bytes: bytes.into(),
            encoding,
        }
    }

    /// リテラル文字列 `(...)` 由来の `PdfString` を生成する。
    ///
    /// `new(bytes, StringEncoding::Literal)` の短縮形。呼び出し側に表記形式を
    /// 明示させるため、既定の encoding を持つ構築経路は提供しない。
    pub fn literal(bytes: impl Into<Vec<u8>>) -> Self {
        Self::new(bytes, StringEncoding::Literal)
    }

    /// 16 進文字列 `<...>` 由来の `PdfString` を生成する。
    ///
    /// `new(bytes, StringEncoding::Hex)` の短縮形。
    pub fn hex(bytes: impl Into<Vec<u8>>) -> Self {
        Self::new(bytes, StringEncoding::Hex)
    }

    /// 復号後バイト列を `&[u8]` として取り出す。
    ///
    /// ヒープ保持のため参照返し（`PdfName::as_bytes` と同方針）。
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes
    }

    /// 元の表記形式を返す。
    ///
    /// `StringEncoding` は `Copy` のため値返し（`IndirectRef::target` と同方針）。
    /// 戻り値型の `StringEncoding` 自体が `#[must_use]` のため、関数側には付けない
    /// （`clippy::double_must_use`）。
    pub fn encoding(&self) -> StringEncoding {
        self.encoding
    }

    /// `self` を消費して復号後バイト列を所有権ごと取り出す。
    ///
    /// encoding を捨ててバイト列だけを使う消費側（`encrypt` の `/O` `/U`、
    /// トレイラの `/ID`）が clone なしで受け取るための経路。命名は既存の
    /// `Window::into_bytes`（`filter/flate/window.rs`）に揃える。2 フィールドだが
    /// `into_parts` にはしない — `StringEncoding` は `Copy` なので分解前に
    /// `encoding()` で取れる。参照取得で足りる場合は `as_bytes()` を使う。
    pub fn into_bytes(self) -> Vec<u8> {
        self.bytes
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn literal_sets_literal_encoding() {
        // literal() で構築すると encoding が Literal になることを確認する
        assert_eq!(
            PdfString::literal(b"abc").encoding(),
            StringEncoding::Literal
        );
    }

    #[test]
    fn hex_sets_hex_encoding() {
        // hex() で構築すると encoding が Hex になることを確認する
        assert_eq!(PdfString::hex(b"abc").encoding(), StringEncoding::Hex);
    }

    #[test]
    fn new_then_as_bytes_roundtrips() {
        // new() に渡したバイト列が as_bytes() でそのまま取り出せることを確認する
        let s = PdfString::new(b"abc".to_vec(), StringEncoding::Literal);
        assert_eq!(s.as_bytes(), b"abc");
    }

    #[test]
    fn into_bytes_returns_owned_bytes() {
        // into_bytes() が所有権ごとバイト列を返すことを確認する
        assert_eq!(PdfString::hex(b"abc").into_bytes(), b"abc".to_vec());
    }

    #[test]
    fn equal_when_bytes_and_encoding_match() {
        // バイト列と encoding が一致すれば等価になることを確認する
        assert_eq!(PdfString::literal(b"Hello"), PdfString::literal(b"Hello"));
    }

    #[test]
    fn accepts_empty_bytes() {
        // 空バイト列（`()` や `<>`）を無検証で受理することを確認する
        assert_eq!(PdfString::literal(Vec::new()).as_bytes(), b"");
    }

    #[test]
    fn accepts_nul_and_non_utf8_bytes() {
        // NUL・非UTF-8 バイトを含むバイト列を無検証で忠実に保持することを確認する
        let raw = vec![b'a', 0x00, 0x80, 0xFF];
        assert_eq!(PdfString::literal(raw.clone()).as_bytes(), raw.as_slice());
    }

    #[test]
    fn not_equal_when_encoding_differs() {
        // 同一バイト列でも encoding が異なれば非等価になることを確認する
        assert_ne!(PdfString::literal(b"Hello"), PdfString::hex(b"Hello"));
    }

    #[test]
    fn not_equal_when_bytes_differ() {
        // encoding が同じでもバイト列が異なれば非等価になることを確認する
        assert_ne!(PdfString::literal(b"a"), PdfString::literal(b"b"));
    }

    #[test]
    fn clone_preserves_content_and_keeps_original_usable() {
        // clone() が内容を保ち、元の値も引き続き使えることを確認する
        let original = PdfString::hex(b"abc");
        let cloned = original.clone();
        assert_eq!(cloned, original);
        assert_eq!(original.as_bytes(), b"abc");
    }

    #[test]
    fn debug_format_contains_type_name() {
        // Debug 出力に型名が含まれることを確認する
        assert!(format!("{:?}", PdfString::literal(b"a")).contains("PdfString"));
    }

    #[test]
    fn works_as_hash_set_member() {
        // Eq/Hash により HashSet の要素として使え、encoding 違いが別要素になることを確認する
        let mut set = std::collections::HashSet::new();
        set.insert(PdfString::literal(b"Hello"));
        set.insert(PdfString::hex(b"Hello"));
        assert_eq!(set.len(), 2);
    }
}
