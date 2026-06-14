//! PDF 字句解析の出力となるトークン型 `Token` および値トークンの内部表現 `Primitive` を
//! 定義するモジュール。
//!
//! ISO 32000-1 §7.2 のレキシカル規約（`docs/specs/01_lexical_conventions.md`）と
//! §7.3 のオブジェクト型分類、実装ガイド（`docs/specs/09_implementation_guide.md` §2.2）に
//! 基づき、§7.3 のスカラ系プリミティブ 7 種を `Primitive` sub-enum に集約し、
//! `Token` 本体は `Primitive(Primitive)` ラッパに加えて配列・辞書・obj/endobj・
//! stream/endstream の構造制御トークン 8 個、無検証バイト列の `Keyword` / `Comment` の
//! 計 11 バリアントで字句種別を表す。構築は無検証で、意味解釈・正規化は上位
//! （parser）に委譲する。`N G R` の 3 字句から `IndirectRef` を組み立てるのは
//! parser 層の責務であり、本モジュールでは `R` を `Keyword(b"R")` として平坦に流す。

use crate::object::name::PdfName;

/// PDF §7.3 のプリミティブオブジェクト（スカラ系・文字列・名前）に対応する字句値を
/// 表す sub-enum。
///
/// 整数幅は `i64`、浮動小数点幅は `f64`（`PdfObject` と同じ幅・同じ無検証方針）。
/// `Real(f64)` を含むため `Eq`/`Hash`/`Ord` は derive できない（IEEE 754: `NaN != NaN`）。
/// `LiteralString` / `HexString` / `Name` がヒープを持つため `Copy` も付けない。
/// 順序（`PartialOrd`）は意味ある全順序がないため不要。`Token::Primitive` でラップされ、
/// `Token::as_primitive().and_then(|p| p.as_integer())` のように 2 段で値を取り出す。
#[derive(Debug, Clone, PartialEq)]
pub enum Primitive {
    /// `null` キーワード（ISO 32000-1 §7.3.9）。値の不在を表す。
    Null,
    /// 真偽値（ISO 32000-1 §7.3.2、`true` / `false`）。
    Boolean(bool),
    /// 整数（ISO 32000-1 §7.3.3、`i64` を無検証で保持）。
    Integer(i64),
    /// 実数（ISO 32000-1 §7.3.3、`f64`、`NaN`/`±0.0`/`Inf` を無検証で保持）。
    ///
    /// NaN を持ちうるため `Primitive` 全体で `Eq`/`Hash`/`Ord` を derive できない
    /// （IEEE 754: `NaN != NaN` がバリアント・enum 全体に伝播する）。
    Real(f64),
    /// リテラル文字列の **デコード後** バイト列（ISO 32000-1 §7.3.4.2）。
    ///
    /// `(...)` 表記のエスケープ解決・改行正規化を行ったあとの生バイト列を保持する。
    /// UTF-8 は仮定せず NUL / 非UTF-8 / 高位バイトも無検証で忠実に保持する
    /// （`PdfObject::String` と同方針）。
    LiteralString(Vec<u8>),
    /// 16 進文字列の **デコード後** バイト列（ISO 32000-1 §7.3.4.3）。
    ///
    /// `<...>` 表記の 16 進ペアを 1 バイトに復号した結果を保持する。
    /// 同一バイト列でも字句の出自が異なるため `LiteralString` とは別バリアントとし、
    /// `==` で非等価になる。UTF-8 は仮定せず無検証で保持する。
    HexString(Vec<u8>),
    /// 名前オブジェクト（ISO 32000-1 §7.3.5、`#XX` デコード後を `PdfName` で内包）。
    ///
    /// `/Name` 表記の `/` 接頭辞と `#XX` 16 進エスケープを除いた本体バイト列を保持する。
    /// `PdfName` がヒープを持つため `Copy` 不可（`PdfObject::Name` と同方針）。
    Name(PdfName),
}

impl Primitive {
    /// `Null` バリアントかどうかを返す述語。
    ///
    /// `Null` のとき `true`、他バリアントでは `false`。
    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }

    /// `Boolean` のとき内部の `bool` を `Some` で取り出す（他は `None`）。
    ///
    /// 値型のため値返し（`PdfObject::as_bool` と同方針）。
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    /// `Integer` のとき内部の `i64` を `Some` で取り出す（他は `None`）。
    ///
    /// 値型のため値返し（`PdfObject::as_integer` と同方針）。
    pub fn as_integer(&self) -> Option<i64> {
        match self {
            Self::Integer(n) => Some(*n),
            _ => None,
        }
    }

    /// `Real` のとき内部の `f64` を `Some` で取り出す（他は `None`）。
    ///
    /// 値型のため値返し。`NaN` も忠実に返すため、等価判定で取り出す場合は
    /// `f64::is_nan` での確認を併用する（`Primitive` の `==` は NaN 非等価のため）。
    pub fn as_real(&self) -> Option<f64> {
        match self {
            Self::Real(r) => Some(*r),
            _ => None,
        }
    }

    /// `LiteralString` のとき内部のバイト列を `&[u8]` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`PdfObject::as_string` と同方針）。
    pub fn as_literal_string(&self) -> Option<&[u8]> {
        match self {
            Self::LiteralString(bytes) => Some(bytes.as_slice()),
            _ => None,
        }
    }

    /// `HexString` のとき内部のバイト列を `&[u8]` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し。`LiteralString` と同一バイト列でも字句出自が
    /// 異なるため別バリアントとして区別される。
    pub fn as_hex_string(&self) -> Option<&[u8]> {
        match self {
            Self::HexString(bytes) => Some(bytes.as_slice()),
            _ => None,
        }
    }

    /// `Name` のとき内部の `PdfName` を `&PdfName` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`PdfObject::as_name` と同方針）。
    pub fn as_name(&self) -> Option<&PdfName> {
        match self {
            Self::Name(name) => Some(name),
            _ => None,
        }
    }
}

/// PDF レキシカル層の出力トークン（§7.2 / §7.3 全体に対応）。
///
/// `Primitive` ラッパ 1 個 + 構造制御トークン 8 個 + `Keyword` / `Comment` の計 11 バリアント
/// で構成される（バリアントは後続タスクで段階的に追加される）。
/// 内部に `Primitive` を含むため `Eq`/`Hash`/`Ord` は derive 不可（NaN 伝播）。
/// `Keyword(Vec<u8>)` / `Comment(Vec<u8>)` / `Primitive` ラップのヒープにより `Copy` 不可。
/// 順序（`PartialOrd`）はトークン間に意味ある全順序がないため不要。
/// よって derive は `Debug, Clone, PartialEq` のみで `Primitive` と完全に一致する。
#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    /// 値を持つ字句（ISO 32000-1 §7.3 のスカラ系プリミティブ 7 種を集約してラップする）。
    ///
    /// `Token::as_integer()` のような shortcut は意図的に提供せず、利用側は
    /// `tok.as_primitive().and_then(|p| p.as_integer())` の 2 段アクセスで値を
    /// 取り出す。これにより Token は「字句種別」、`Primitive` は「値の型」と
    /// 責務分離が API 表面に明示される。
    Primitive(Primitive),
    /// 配列開始 `[`（ISO 32000-1 §7.3.6）。
    ArrayBegin,
    /// 配列終了 `]`（ISO 32000-1 §7.3.6）。
    ArrayEnd,
    /// 辞書開始 `<<`（ISO 32000-1 §7.3.7）。
    DictBegin,
    /// 辞書終了 `>>`（ISO 32000-1 §7.3.7）。
    DictEnd,
    /// 間接オブジェクト開始 `obj` キーワード（ISO 32000-1 §7.3.10）。
    ObjBegin,
    /// 間接オブジェクト終了 `endobj` キーワード（ISO 32000-1 §7.3.10）。
    ObjEnd,
    /// ストリーム開始 `stream` キーワード（ISO 32000-1 §7.3.8）。
    StreamBegin,
    /// ストリーム終了 `endstream` キーワード（ISO 32000-1 §7.3.8）。
    StreamEnd,
    /// 無検証キーワード（`R` / `xref` / `trailer` / `startxref` / `f` / `n` /
    /// 未知の正規バイト列）。
    ///
    /// `N G R` の 3 字句から間接参照を組み立てるのは parser の責務であり、
    /// 本層では `R` も単独 `Keyword(b"R")` として平坦に流す。意味解釈は上位
    /// パーサに委譲し、UTF-8 を仮定せず生バイトを保持する。
    Keyword(Vec<u8>),
    /// コメント本体（ISO 32000-1 §7.2.4）。
    ///
    /// 先頭 `%` と末尾の改行（CR/LF/CRLF）を **含めない** 本文バイト列のみを保持する。
    /// `%PDF-1.7` / `%%EOF` はそれぞれ `Comment(b"PDF-1.7".to_vec())` /
    /// `Comment(b"%EOF".to_vec())` として `%` を除いた本文のみとする
    /// （`%%EOF` の 2 個目の `%` は本文の一部）。
    /// 行末判定（CR / LF / CRLF）は `EolKind::at` に委譲する。
    Comment(Vec<u8>),
}

impl Token {
    /// `ArrayBegin` バリアントかどうかを返す述語。
    pub fn is_array_begin(&self) -> bool {
        matches!(self, Self::ArrayBegin)
    }

    /// `ArrayEnd` バリアントかどうかを返す述語。
    pub fn is_array_end(&self) -> bool {
        matches!(self, Self::ArrayEnd)
    }

    /// `DictBegin` バリアントかどうかを返す述語。
    pub fn is_dict_begin(&self) -> bool {
        matches!(self, Self::DictBegin)
    }

    /// `DictEnd` バリアントかどうかを返す述語。
    pub fn is_dict_end(&self) -> bool {
        matches!(self, Self::DictEnd)
    }

    /// `ObjBegin` バリアントかどうかを返す述語。
    pub fn is_obj_begin(&self) -> bool {
        matches!(self, Self::ObjBegin)
    }

    /// `ObjEnd` バリアントかどうかを返す述語。
    pub fn is_obj_end(&self) -> bool {
        matches!(self, Self::ObjEnd)
    }

    /// `StreamBegin` バリアントかどうかを返す述語。
    pub fn is_stream_begin(&self) -> bool {
        matches!(self, Self::StreamBegin)
    }

    /// `StreamEnd` バリアントかどうかを返す述語。
    pub fn is_stream_end(&self) -> bool {
        matches!(self, Self::StreamEnd)
    }

    /// `Primitive` のとき内部の `&Primitive` を `Some` で取り出す（他は `None`）。
    ///
    /// 値の取り出しは 2 段で行う:
    /// `tok.as_primitive().and_then(|p| p.as_integer())`。
    /// shortcut（`Token::as_integer()` 等）は意図的に提供せず、責務分離を保つ。
    pub fn as_primitive(&self) -> Option<&Primitive> {
        match self {
            Self::Primitive(p) => Some(p),
            _ => None,
        }
    }

    /// `Keyword` のとき内部のバイト列を `&[u8]` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し。`R` 単独識別は `tok.as_keyword() == Some(b"R" as &[u8])`
    /// のように検査する。
    pub fn as_keyword(&self) -> Option<&[u8]> {
        match self {
            Self::Keyword(b) => Some(b.as_slice()),
            _ => None,
        }
    }

    /// `Comment` のとき内部のバイト列を `&[u8]` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し。先頭 `%` と末尾 EOL は含まない本文バイト列のみが
    /// 返る（構築時点で除外されている前提）。
    pub fn as_comment(&self) -> Option<&[u8]> {
        match self {
            Self::Comment(b) => Some(b.as_slice()),
            _ => None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn primitive_null_constructs_and_matches_null_arm() {
        // Primitive::Null を構築し match で Null 腕に入ることを確認する
        let p = Primitive::Null;
        assert!(matches!(p, Primitive::Null));
    }

    #[test]
    fn primitive_is_null_returns_true_for_null() {
        // Primitive::Null に is_null() を呼ぶと true を返すことを確認する
        assert!(Primitive::Null.is_null());
    }

    #[test]
    fn primitive_boolean_constructs_and_matches_with_inner_value() {
        // Primitive::Boolean(true) を構築し match の Boolean(b) 腕で b == true になることを確認する
        let p = Primitive::Boolean(true);
        match p {
            Primitive::Boolean(b) => assert!(b),
            _ => panic!("Boolean 腕に入らなかった"),
        }
    }

    #[test]
    fn primitive_integer_constructs_and_matches_with_inner_value() {
        // Primitive::Integer(42) を構築し match の Integer(n) 腕で n == 42 になることを確認する
        let p = Primitive::Integer(42);
        match p {
            Primitive::Integer(n) => assert_eq!(n, 42),
            _ => panic!("Integer 腕に入らなかった"),
        }
    }

    #[test]
    fn primitive_real_constructs_and_matches_with_inner_value() {
        // Primitive::Real(1.5) を構築し match の Real(r) 腕で r == 1.5 になることを確認する
        let p = Primitive::Real(1.5);
        match p {
            Primitive::Real(r) => assert_eq!(r, 1.5),
            _ => panic!("Real 腕に入らなかった"),
        }
    }

    #[test]
    fn primitive_as_bool_returns_some_for_boolean() {
        // Primitive::Boolean(true) に as_bool() を呼ぶと Some(true) を返すことを確認する
        assert_eq!(Primitive::Boolean(true).as_bool(), Some(true));
    }

    #[test]
    fn primitive_as_integer_returns_some_for_integer() {
        // Primitive::Integer(7) に as_integer() を呼ぶと Some(7) を返すことを確認する
        assert_eq!(Primitive::Integer(7).as_integer(), Some(7));
    }

    #[test]
    fn primitive_as_real_returns_some_for_real() {
        // Primitive::Real(2.5) に as_real() を呼ぶと Some(2.5) を返すことを確認する
        assert_eq!(Primitive::Real(2.5).as_real(), Some(2.5));
    }

    #[test]
    fn primitive_as_bool_returns_none_for_non_boolean_variants() {
        // Boolean 以外（Null/Integer/Real/LiteralString/HexString/Name）では as_bool() が None を返すことを確認する
        for p in &[
            Primitive::Null,
            Primitive::Integer(0),
            Primitive::Real(0.0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ] {
            assert_eq!(p.as_bool(), None);
        }
    }

    #[test]
    fn primitive_as_integer_returns_none_for_non_integer_variants() {
        // Integer 以外（Null/Boolean/Real/LiteralString/HexString/Name）では as_integer() が None を返すことを確認する
        for p in &[
            Primitive::Null,
            Primitive::Boolean(true),
            Primitive::Real(0.0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ] {
            assert_eq!(p.as_integer(), None);
        }
    }

    #[test]
    fn primitive_as_real_returns_none_for_non_real_variants() {
        // Real 以外（Null/Boolean/Integer/LiteralString/HexString/Name）では as_real() が None を返すことを確認する
        for p in &[
            Primitive::Null,
            Primitive::Boolean(true),
            Primitive::Integer(0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ] {
            assert_eq!(p.as_real(), None);
        }
    }

    #[test]
    fn primitive_literal_string_constructs_and_matches_literal_string_arm() {
        // Primitive::LiteralString(b"abc") を構築し matches! で LiteralString 腕に入ることを確認する
        let p = Primitive::LiteralString(b"abc".to_vec());
        assert!(matches!(p, Primitive::LiteralString(_)));
    }

    #[test]
    fn primitive_hex_string_constructs_and_matches_hex_string_arm() {
        // Primitive::HexString(b"abc") を構築し matches! で HexString 腕に入ることを確認する
        let p = Primitive::HexString(b"abc".to_vec());
        assert!(matches!(p, Primitive::HexString(_)));
    }

    #[test]
    fn primitive_name_constructs_and_matches_name_arm() {
        // Primitive::Name(PdfName::from("Type")) を構築し matches! で Name 腕に入ることを確認する
        let p = Primitive::Name(PdfName::from("Type"));
        assert!(matches!(p, Primitive::Name(_)));
    }

    #[test]
    fn primitive_as_literal_string_returns_some_for_literal_string() {
        // Primitive::LiteralString(b"abc") に as_literal_string() を呼ぶと Some(b"abc") を返すことを確認する
        assert_eq!(
            Primitive::LiteralString(b"abc".to_vec()).as_literal_string(),
            Some(b"abc".as_slice())
        );
    }

    #[test]
    fn primitive_as_hex_string_returns_some_for_hex_string() {
        // Primitive::HexString(b"abc") に as_hex_string() を呼ぶと Some(b"abc") を返すことを確認する
        assert_eq!(
            Primitive::HexString(b"abc".to_vec()).as_hex_string(),
            Some(b"abc".as_slice())
        );
    }

    #[test]
    fn primitive_as_name_returns_some_for_name() {
        // Primitive::Name(PdfName::from("Type")) に as_name() を呼ぶと Some(&PdfName::from("Type")) を返すことを確認する
        let name = PdfName::from("Type");
        assert_eq!(
            Primitive::Name(PdfName::from("Type")).as_name(),
            Some(&name)
        );
    }

    #[test]
    fn primitive_as_literal_string_returns_none_for_non_literal_string_variants() {
        // LiteralString 以外（Null/Boolean/Integer/Real/HexString/Name）では as_literal_string() が None を返すことを確認する
        for p in &[
            Primitive::Null,
            Primitive::Boolean(true),
            Primitive::Integer(0),
            Primitive::Real(0.0),
            Primitive::HexString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ] {
            assert_eq!(p.as_literal_string(), None);
        }
    }

    #[test]
    fn primitive_as_hex_string_returns_none_for_non_hex_string_variants() {
        // HexString 以外（Null/Boolean/Integer/Real/LiteralString/Name）では as_hex_string() が None を返すことを確認する
        for p in &[
            Primitive::Null,
            Primitive::Boolean(true),
            Primitive::Integer(0),
            Primitive::Real(0.0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ] {
            assert_eq!(p.as_hex_string(), None);
        }
    }

    #[test]
    fn primitive_as_name_returns_none_for_non_name_variants() {
        // Name 以外（Null/Boolean/Integer/Real/LiteralString/HexString）では as_name() が None を返すことを確認する
        for p in &[
            Primitive::Null,
            Primitive::Boolean(true),
            Primitive::Integer(0),
            Primitive::Real(0.0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec()),
        ] {
            assert_eq!(p.as_name(), None);
        }
    }

    #[test]
    fn token_array_begin_constructs_and_matches_array_begin_arm() {
        // Token::ArrayBegin を構築し matches! で ArrayBegin 腕に入ることを確認する
        let t = Token::ArrayBegin;
        assert!(matches!(t, Token::ArrayBegin));
    }

    #[test]
    fn token_array_end_constructs_and_matches_array_end_arm() {
        // Token::ArrayEnd を構築し matches! で ArrayEnd 腕に入ることを確認する
        let t = Token::ArrayEnd;
        assert!(matches!(t, Token::ArrayEnd));
    }

    #[test]
    fn token_dict_begin_constructs_and_matches_dict_begin_arm() {
        // Token::DictBegin を構築し matches! で DictBegin 腕に入ることを確認する
        let t = Token::DictBegin;
        assert!(matches!(t, Token::DictBegin));
    }

    #[test]
    fn token_dict_end_constructs_and_matches_dict_end_arm() {
        // Token::DictEnd を構築し matches! で DictEnd 腕に入ることを確認する
        let t = Token::DictEnd;
        assert!(matches!(t, Token::DictEnd));
    }

    #[test]
    fn token_obj_begin_constructs_and_matches_obj_begin_arm() {
        // Token::ObjBegin を構築し matches! で ObjBegin 腕に入ることを確認する
        let t = Token::ObjBegin;
        assert!(matches!(t, Token::ObjBegin));
    }

    #[test]
    fn token_obj_end_constructs_and_matches_obj_end_arm() {
        // Token::ObjEnd を構築し matches! で ObjEnd 腕に入ることを確認する
        let t = Token::ObjEnd;
        assert!(matches!(t, Token::ObjEnd));
    }

    #[test]
    fn token_stream_begin_constructs_and_matches_stream_begin_arm() {
        // Token::StreamBegin を構築し matches! で StreamBegin 腕に入ることを確認する
        let t = Token::StreamBegin;
        assert!(matches!(t, Token::StreamBegin));
    }

    #[test]
    fn token_stream_end_constructs_and_matches_stream_end_arm() {
        // Token::StreamEnd を構築し matches! で StreamEnd 腕に入ることを確認する
        let t = Token::StreamEnd;
        assert!(matches!(t, Token::StreamEnd));
    }

    #[test]
    fn token_is_array_begin_returns_true_for_array_begin() {
        // Token::ArrayBegin に is_array_begin() を呼ぶと true を返すことを確認する
        assert!(Token::ArrayBegin.is_array_begin());
    }

    #[test]
    fn token_is_array_end_returns_true_for_array_end() {
        // Token::ArrayEnd に is_array_end() を呼ぶと true を返すことを確認する
        assert!(Token::ArrayEnd.is_array_end());
    }

    #[test]
    fn token_is_dict_begin_returns_true_for_dict_begin() {
        // Token::DictBegin に is_dict_begin() を呼ぶと true を返すことを確認する
        assert!(Token::DictBegin.is_dict_begin());
    }

    #[test]
    fn token_is_dict_end_returns_true_for_dict_end() {
        // Token::DictEnd に is_dict_end() を呼ぶと true を返すことを確認する
        assert!(Token::DictEnd.is_dict_end());
    }

    #[test]
    fn token_is_obj_begin_returns_true_for_obj_begin() {
        // Token::ObjBegin に is_obj_begin() を呼ぶと true を返すことを確認する
        assert!(Token::ObjBegin.is_obj_begin());
    }

    #[test]
    fn token_is_obj_end_returns_true_for_obj_end() {
        // Token::ObjEnd に is_obj_end() を呼ぶと true を返すことを確認する
        assert!(Token::ObjEnd.is_obj_end());
    }

    #[test]
    fn token_is_stream_begin_returns_true_for_stream_begin() {
        // Token::StreamBegin に is_stream_begin() を呼ぶと true を返すことを確認する
        assert!(Token::StreamBegin.is_stream_begin());
    }

    #[test]
    fn token_is_stream_end_returns_true_for_stream_end() {
        // Token::StreamEnd に is_stream_end() を呼ぶと true を返すことを確認する
        assert!(Token::StreamEnd.is_stream_end());
    }

    #[test]
    fn token_is_array_begin_returns_false_for_non_array_begin_variants() {
        // ArrayBegin 以外の構造制御トークン 7 個では is_array_begin() が false を返すことを確認する
        for t in &[
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert!(!t.is_array_begin());
        }
    }

    #[test]
    fn token_is_array_end_returns_false_for_non_array_end_variants() {
        // ArrayEnd 以外の構造制御トークン 7 個では is_array_end() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert!(!t.is_array_end());
        }
    }

    #[test]
    fn token_is_dict_begin_returns_false_for_non_dict_begin_variants() {
        // DictBegin 以外の構造制御トークン 7 個では is_dict_begin() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert!(!t.is_dict_begin());
        }
    }

    #[test]
    fn token_is_dict_end_returns_false_for_non_dict_end_variants() {
        // DictEnd 以外の構造制御トークン 7 個では is_dict_end() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert!(!t.is_dict_end());
        }
    }

    #[test]
    fn token_is_obj_begin_returns_false_for_non_obj_begin_variants() {
        // ObjBegin 以外の構造制御トークン 7 個では is_obj_begin() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert!(!t.is_obj_begin());
        }
    }

    #[test]
    fn token_is_obj_end_returns_false_for_non_obj_end_variants() {
        // ObjEnd 以外の構造制御トークン 7 個では is_obj_end() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert!(!t.is_obj_end());
        }
    }

    #[test]
    fn token_is_stream_begin_returns_false_for_non_stream_begin_variants() {
        // StreamBegin 以外の構造制御トークン 7 個では is_stream_begin() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamEnd,
        ] {
            assert!(!t.is_stream_begin());
        }
    }

    #[test]
    fn token_is_stream_end_returns_false_for_non_stream_end_variants() {
        // StreamEnd 以外の構造制御トークン 7 個では is_stream_end() が false を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
        ] {
            assert!(!t.is_stream_end());
        }
    }

    #[test]
    fn token_primitive_constructs_and_matches_primitive_arm() {
        // Token::Primitive(Primitive::Integer(7)) を構築し matches! で Primitive 腕に入ることを確認する
        let t = Token::Primitive(Primitive::Integer(7));
        assert!(matches!(t, Token::Primitive(_)));
    }

    #[test]
    fn token_as_primitive_returns_some_for_primitive() {
        // Token::Primitive(Primitive::Integer(7)) に as_primitive() を呼ぶと Some(&Primitive::Integer(7)) を返すことを確認する
        let p = Primitive::Integer(7);
        assert_eq!(Token::Primitive(p.clone()).as_primitive(), Some(&p));
    }

    #[test]
    fn token_as_primitive_returns_none_for_non_primitive_variants() {
        // Primitive 以外（構造制御 8 個の代表）では as_primitive() が None を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
        ] {
            assert_eq!(t.as_primitive(), None);
        }
    }

    #[test]
    fn token_primitive_integer_roundtrips_via_as_primitive_and_as_integer() {
        // Token::Primitive(Primitive::Integer(7)).as_primitive().and_then(|p| p.as_integer()) == Some(7) を確認する（2 段アクセス）
        let t = Token::Primitive(Primitive::Integer(7));
        assert_eq!(t.as_primitive().and_then(|p| p.as_integer()), Some(7));
    }

    #[test]
    fn token_primitive_name_roundtrips_via_as_primitive_and_as_name() {
        // Token::Primitive(Primitive::Name(...)) を as_primitive().and_then(as_name) で取り出すと元の PdfName が返ることを確認する
        let name = PdfName::from("Type");
        let t = Token::Primitive(Primitive::Name(PdfName::from("Type")));
        assert_eq!(t.as_primitive().and_then(|p| p.as_name()), Some(&name));
    }

    #[test]
    fn token_primitive_real_nan_roundtrips_preserves_nan_via_as_primitive() {
        // Token::Primitive(Primitive::Real(NaN)) を as_primitive().and_then(as_real) で取り出すと is_nan() が真になることを確認する
        let t = Token::Primitive(Primitive::Real(f64::NAN));
        assert!(t
            .as_primitive()
            .and_then(|p| p.as_real())
            .is_some_and(f64::is_nan));
    }

    #[test]
    fn token_keyword_constructs_and_matches_keyword_arm() {
        // Token::Keyword(b"xref") を構築し matches! で Keyword 腕に入ることを確認する
        let t = Token::Keyword(b"xref".to_vec());
        assert!(matches!(t, Token::Keyword(_)));
    }

    #[test]
    fn token_comment_constructs_and_matches_comment_arm() {
        // Token::Comment(b"PDF-1.7") を構築し matches! で Comment 腕に入ることを確認する
        let t = Token::Comment(b"PDF-1.7".to_vec());
        assert!(matches!(t, Token::Comment(_)));
    }

    #[test]
    fn token_as_keyword_returns_some_for_keyword() {
        // Token::Keyword(b"xref") に as_keyword() を呼ぶと Some(b"xref") を返すことを確認する
        assert_eq!(
            Token::Keyword(b"xref".to_vec()).as_keyword(),
            Some(b"xref".as_slice())
        );
    }

    #[test]
    fn token_as_comment_returns_some_for_comment() {
        // Token::Comment(b"PDF-1.7") に as_comment() を呼ぶと Some(b"PDF-1.7") を返すことを確認する
        assert_eq!(
            Token::Comment(b"PDF-1.7".to_vec()).as_comment(),
            Some(b"PDF-1.7".as_slice())
        );
    }

    #[test]
    fn token_as_keyword_returns_none_for_non_keyword_variants() {
        // Keyword 以外（Primitive/構造制御 8 個から代表 + Comment）では as_keyword() が None を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::DictBegin,
            Token::ObjBegin,
            Token::StreamBegin,
            Token::Comment(b"x".to_vec()),
        ] {
            assert_eq!(t.as_keyword(), None);
        }
    }

    #[test]
    fn token_as_comment_returns_none_for_non_comment_variants() {
        // Comment 以外（Primitive/構造制御 8 個から代表 + Keyword）では as_comment() が None を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::DictBegin,
            Token::ObjBegin,
            Token::StreamBegin,
            Token::Keyword(b"xref".to_vec()),
        ] {
            assert_eq!(t.as_comment(), None);
        }
    }

    // ---------- Phase D-1: Primitive 等価・非等価 ----------

    #[test]
    fn primitive_same_variant_same_value_is_equal() {
        // 同一バリアント・同値の Primitive 同士は == で等価になることを確認する
        assert_eq!(Primitive::Null, Primitive::Null);
        assert_eq!(Primitive::Boolean(false), Primitive::Boolean(false));
        assert_eq!(Primitive::Integer(1), Primitive::Integer(1));
    }

    #[test]
    fn primitive_different_variants_are_not_equal() {
        // 異なるバリアント間は数値的同値でも != で非等価になることを確認する
        assert_ne!(Primitive::Integer(1), Primitive::Real(1.0));
        assert_ne!(Primitive::Boolean(false), Primitive::Null);
    }

    #[test]
    fn primitive_same_content_literal_strings_are_equal() {
        // 同内容の LiteralString 同士は == で等価になることを確認する
        assert_eq!(
            Primitive::LiteralString(b"x".to_vec()),
            Primitive::LiteralString(b"x".to_vec())
        );
    }

    #[test]
    fn primitive_literal_string_and_hex_string_with_same_bytes_are_not_equal() {
        // 同一バイト内容でも LiteralString と HexString は別バリアントのため != で非等価になることを確認する
        assert_ne!(
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec())
        );
    }

    #[test]
    fn primitive_name_and_literal_string_with_same_bytes_are_not_equal() {
        // 同一バイト内容でも Name と LiteralString は別バリアントのため != で非等価になることを確認する
        assert_ne!(
            Primitive::Name(PdfName::from("Type")),
            Primitive::LiteralString(b"Type".to_vec())
        );
    }

    // ---------- Phase D-2: Token 等価・非等価 ----------

    #[test]
    fn token_same_variant_same_value_is_equal() {
        // 同一バリアント・同値の Token 同士は == で等価になることを確認する
        assert_eq!(Token::ArrayBegin, Token::ArrayBegin);
        assert_eq!(
            Token::Primitive(Primitive::Integer(7)),
            Token::Primitive(Primitive::Integer(7))
        );
    }

    #[test]
    fn token_different_variants_are_not_equal() {
        // 異なる Token バリアント間は != で非等価になることを確認する
        assert_ne!(Token::ArrayBegin, Token::DictBegin);
        assert_ne!(Token::ObjEnd, Token::StreamEnd);
    }

    #[test]
    fn token_same_content_keywords_are_equal() {
        // 同内容の Keyword 同士は == で等価になることを確認する
        assert_eq!(
            Token::Keyword(b"xref".to_vec()),
            Token::Keyword(b"xref".to_vec())
        );
    }

    #[test]
    fn token_different_content_keywords_are_not_equal() {
        // 異内容の Keyword 同士は != で非等価になることを確認する
        assert_ne!(
            Token::Keyword(b"xref".to_vec()),
            Token::Keyword(b"trailer".to_vec())
        );
    }

    #[test]
    fn token_same_inner_primitives_are_equal() {
        // 同一内容の Primitive を内包する Token 同士は == で等価になることを確認する
        assert_eq!(
            Token::Primitive(Primitive::Boolean(true)),
            Token::Primitive(Primitive::Boolean(true))
        );
    }

    // ---------- Phase D-3: Primitive 全 7 バリアント総当たり + is_null() false 側 ----------

    #[test]
    fn primitive_all_distinct_variants_are_mutually_not_equal() {
        // 全 7 バリアントを総当たりで比較し、同一インデックスのみ等価・他は非等価であることを確認する
        // （NaN は等価判定が崩れるため代表値には含めず Real(0.0) を採用）
        let variants = [
            Primitive::Null,
            Primitive::Boolean(false),
            Primitive::Integer(0),
            Primitive::Real(0.0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ];
        for (i, a) in variants.iter().enumerate() {
            for (j, b) in variants.iter().enumerate() {
                if i == j {
                    assert_eq!(a, b);
                } else {
                    assert_ne!(a, b);
                }
            }
        }
    }

    #[test]
    fn primitive_is_null_returns_false_for_non_null_variants() {
        // Null 以外の 6 バリアント代表値では is_null() が false を返すことを確認する
        for p in &[
            Primitive::Boolean(true),
            Primitive::Integer(0),
            Primitive::Real(0.0),
            Primitive::LiteralString(b"abc".to_vec()),
            Primitive::HexString(b"abc".to_vec()),
            Primitive::Name(PdfName::from("Type")),
        ] {
            assert!(!p.is_null());
        }
    }

    // ---------- Phase D-4: Token 全 11 バリアント総当たり ----------

    #[test]
    fn token_all_distinct_variants_are_mutually_not_equal() {
        // 全 11 バリアントを総当たりで比較し、同一インデックスのみ等価・他は非等価であることを確認する
        let variants = [
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(b"xref".to_vec()),
            Token::Comment(b"PDF-1.7".to_vec()),
        ];
        for (i, a) in variants.iter().enumerate() {
            for (j, b) in variants.iter().enumerate() {
                if i == j {
                    assert_eq!(a, b);
                } else {
                    assert_ne!(a, b);
                }
            }
        }
    }

    // ---------- Phase D-5: Primitive 境界値 ----------

    #[test]
    fn primitive_integer_preserves_i64_boundaries() {
        // Primitive::Integer(i64::MIN) / Integer(i64::MAX) を as_integer() でそのまま取り出せることを確認する
        for n in [i64::MIN, i64::MAX] {
            assert_eq!(Primitive::Integer(n).as_integer(), Some(n));
        }
    }

    #[test]
    fn primitive_positive_and_negative_zero_are_equal() {
        // Primitive::Real(0.0) と Real(-0.0) は IEEE 754 準拠で == 等価になることを確認する
        assert_eq!(Primitive::Real(0.0), Primitive::Real(-0.0));
    }

    #[test]
    fn primitive_nan_is_not_equal_to_itself() {
        // Primitive::Real(NaN) 同士は IEEE 754 準拠で != 非等価（NaN != NaN）になることを確認する
        assert_ne!(Primitive::Real(f64::NAN), Primitive::Real(f64::NAN));
    }

    #[test]
    fn primitive_real_preserves_infinities() {
        // Primitive::Real(±INFINITY) を as_real() でそのまま取り出せることを確認する
        for r in [f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(Primitive::Real(r).as_real(), Some(r));
        }
    }

    // ---------- Phase D-6: Clone 保持 (Primitive 3 + Token 2) ----------

    #[test]
    fn primitive_clone_preserves_value_and_keeps_original_usable() {
        // 値型 Primitive（Integer/Boolean）を clone() すると複製が元と == かつ元も使用可能なことを確認する
        let original = Primitive::Integer(7);
        let cloned = original.clone();
        assert_eq!(cloned, original);
        assert_eq!(original.as_integer(), Some(7));

        let original_b = Primitive::Boolean(true);
        let cloned_b = original_b.clone();
        assert_eq!(cloned_b, original_b);
        assert_eq!(original_b.as_bool(), Some(true));
    }

    #[test]
    fn primitive_clone_preserves_nan_real() {
        // Primitive::Real(NaN) の clone は == では検証できないため as_real().is_some_and(is_nan) で確認する
        let original = Primitive::Real(f64::NAN);
        let cloned = original.clone();
        assert!(cloned.as_real().is_some_and(f64::is_nan));
    }

    #[test]
    fn primitive_clone_preserves_heap_variants_and_keeps_original_usable() {
        // ヒープ型 Primitive（LiteralString/HexString/Name）を clone() すると中身が元と一致し元も使用可能なことを確認する
        let original_lit = Primitive::LiteralString(b"abc".to_vec());
        let cloned_lit = original_lit.clone();
        assert_eq!(cloned_lit.as_literal_string(), Some(b"abc".as_slice()));
        assert_eq!(original_lit.as_literal_string(), Some(b"abc".as_slice()));

        let original_hex = Primitive::HexString(b"xyz".to_vec());
        let cloned_hex = original_hex.clone();
        assert_eq!(cloned_hex.as_hex_string(), Some(b"xyz".as_slice()));
        assert_eq!(original_hex.as_hex_string(), Some(b"xyz".as_slice()));

        let original_name = Primitive::Name(PdfName::from("Type"));
        let cloned_name = original_name.clone();
        assert_eq!(cloned_name.as_name().unwrap().as_bytes(), b"Type");
        assert_eq!(original_name.as_name().unwrap().as_bytes(), b"Type");
    }

    #[test]
    fn token_clone_preserves_primitive_and_keeps_original_usable() {
        // Token::Primitive(Primitive::Integer(7)) を clone() すると 2 段アクセスで元と一致し元も使用可能なことを確認する
        let original = Token::Primitive(Primitive::Integer(7));
        let cloned = original.clone();
        assert_eq!(cloned.as_primitive().and_then(|p| p.as_integer()), Some(7));
        assert_eq!(
            original.as_primitive().and_then(|p| p.as_integer()),
            Some(7)
        );
    }

    #[test]
    fn token_clone_preserves_heap_variants_and_keeps_original_usable() {
        // ヒープ型 Token（Keyword/Comment/Primitive(LiteralString)）を clone() すると元と一致し元も使用可能なことを確認する
        let original_kw = Token::Keyword(b"xref".to_vec());
        let cloned_kw = original_kw.clone();
        assert_eq!(cloned_kw.as_keyword(), Some(b"xref".as_slice()));
        assert_eq!(original_kw.as_keyword(), Some(b"xref".as_slice()));

        let original_cm = Token::Comment(b"PDF-1.7".to_vec());
        let cloned_cm = original_cm.clone();
        assert_eq!(cloned_cm.as_comment(), Some(b"PDF-1.7".as_slice()));
        assert_eq!(original_cm.as_comment(), Some(b"PDF-1.7".as_slice()));

        let original_lit = Token::Primitive(Primitive::LiteralString(b"abc".to_vec()));
        let cloned_lit = original_lit.clone();
        assert_eq!(
            cloned_lit
                .as_primitive()
                .and_then(|p| p.as_literal_string()),
            Some(b"abc".as_slice())
        );
        assert_eq!(
            original_lit
                .as_primitive()
                .and_then(|p| p.as_literal_string()),
            Some(b"abc".as_slice())
        );
    }

    // ---------- Phase D-7: Debug 表示 ----------

    #[test]
    fn primitive_debug_format_contains_variant_name() {
        // Primitive の Debug 出力が各バリアント名を含むことを確認する
        assert!(format!("{:?}", Primitive::Null).contains("Null"));
        assert!(format!("{:?}", Primitive::Boolean(true)).contains("Boolean"));
        assert!(format!("{:?}", Primitive::Integer(0)).contains("Integer"));
        assert!(format!("{:?}", Primitive::Real(0.0)).contains("Real"));
        assert!(format!("{:?}", Primitive::LiteralString(b"x".to_vec())).contains("LiteralString"));
        assert!(format!("{:?}", Primitive::HexString(b"x".to_vec())).contains("HexString"));
        assert!(format!("{:?}", Primitive::Name(PdfName::from("A"))).contains("Name"));
    }

    #[test]
    fn token_debug_format_contains_variant_name() {
        // Token の Debug 出力が各バリアント名を含むことを確認する
        assert!(format!("{:?}", Token::Primitive(Primitive::Null)).contains("Primitive"));
        assert!(format!("{:?}", Token::ArrayBegin).contains("ArrayBegin"));
        assert!(format!("{:?}", Token::ArrayEnd).contains("ArrayEnd"));
        assert!(format!("{:?}", Token::DictBegin).contains("DictBegin"));
        assert!(format!("{:?}", Token::DictEnd).contains("DictEnd"));
        assert!(format!("{:?}", Token::ObjBegin).contains("ObjBegin"));
        assert!(format!("{:?}", Token::ObjEnd).contains("ObjEnd"));
        assert!(format!("{:?}", Token::StreamBegin).contains("StreamBegin"));
        assert!(format!("{:?}", Token::StreamEnd).contains("StreamEnd"));
        assert!(format!("{:?}", Token::Keyword(b"xref".to_vec())).contains("Keyword"));
        assert!(format!("{:?}", Token::Comment(b"x".to_vec())).contains("Comment"));
    }

    // ---------- Phase D-8: 空・特殊バイト保持 ----------

    #[test]
    fn primitive_as_literal_string_returns_empty_slice_for_empty_literal_string() {
        // 空バイト列の Primitive::LiteralString(b"") は as_literal_string() で Some(空スライス) を返すことを確認する
        assert_eq!(
            Primitive::LiteralString(b"".to_vec()).as_literal_string(),
            Some(b"".as_slice())
        );
    }

    #[test]
    fn primitive_as_hex_string_returns_empty_slice_for_empty_hex_string() {
        // 空バイト列の Primitive::HexString(b"") は as_hex_string() で Some(空スライス) を返すことを確認する
        assert_eq!(
            Primitive::HexString(b"".to_vec()).as_hex_string(),
            Some(b"".as_slice())
        );
    }

    #[test]
    fn primitive_as_literal_string_preserves_nul_non_utf8_and_high_bytes() {
        // Primitive::LiteralString(vec![0x00, 0x80, 0xFF]) を as_literal_string() で取り出すと忠実に返ることを確認する
        let p = Primitive::LiteralString(vec![0x00, 0x80, 0xFF]);
        assert_eq!(p.as_literal_string(), Some([0x00, 0x80, 0xFF].as_slice()));
    }

    #[test]
    fn primitive_as_hex_string_preserves_nul_non_utf8_and_high_bytes() {
        // Primitive::HexString(vec![0x00, 0x80, 0xFF]) を as_hex_string() で取り出すと忠実に返ることを確認する
        let p = Primitive::HexString(vec![0x00, 0x80, 0xFF]);
        assert_eq!(p.as_hex_string(), Some([0x00, 0x80, 0xFF].as_slice()));
    }

    #[test]
    fn primitive_as_name_preserves_nul_non_utf8_and_high_bytes() {
        // Primitive::Name(PdfName::new(vec![0x00, 0x80, 0xFF])) を as_name().as_bytes() で取り出すと忠実に返ることを確認する
        let p = Primitive::Name(PdfName::new(vec![0x00, 0x80, 0xFF]));
        assert_eq!(p.as_name().unwrap().as_bytes(), &[0x00, 0x80, 0xFF]);
    }

    #[test]
    fn token_as_keyword_returns_empty_slice_for_empty_keyword() {
        // 空バイト列の Token::Keyword(b"") は as_keyword() で Some(空スライス) を返すことを確認する
        assert_eq!(
            Token::Keyword(b"".to_vec()).as_keyword(),
            Some(b"".as_slice())
        );
    }

    #[test]
    fn token_as_comment_returns_empty_slice_for_empty_comment() {
        // 空バイト列の Token::Comment(b"") は as_comment() で Some(空スライス) を返すことを確認する
        assert_eq!(
            Token::Comment(b"".to_vec()).as_comment(),
            Some(b"".as_slice())
        );
    }

    #[test]
    fn token_as_keyword_preserves_nul_non_utf8_and_high_bytes() {
        // Token::Keyword(vec![0x00, 0x80, 0xFF]) を as_keyword() で取り出すと忠実に返ることを確認する
        let t = Token::Keyword(vec![0x00, 0x80, 0xFF]);
        assert_eq!(t.as_keyword(), Some([0x00, 0x80, 0xFF].as_slice()));
    }

    #[test]
    fn token_as_comment_preserves_nul_non_utf8_and_high_bytes() {
        // Token::Comment(vec![0x00, 0x80, 0xFF]) を as_comment() で取り出すと忠実に返ることを確認する
        let t = Token::Comment(vec![0x00, 0x80, 0xFF]);
        assert_eq!(t.as_comment(), Some([0x00, 0x80, 0xFF].as_slice()));
    }

    // ---------- Phase D-9: グループ重複（近接バリアント） ----------

    #[test]
    fn token_adjacent_delimiter_variants_are_mutually_not_equal() {
        // 開始/終了ペア・配列/辞書/obj/stream の近接バリアントが != であることを確認する
        assert_ne!(Token::ArrayBegin, Token::DictBegin);
        assert_ne!(Token::ArrayEnd, Token::DictEnd);
        assert_ne!(Token::ObjBegin, Token::StreamBegin);
        assert_ne!(Token::ObjEnd, Token::StreamEnd);
    }

    // ---------- Phase D-10: クロスチェック（Token と Primitive の境界） ----------

    #[test]
    fn token_keyword_and_primitive_literal_string_with_same_bytes_are_not_equal() {
        // 同一バイト内容でも Token::Keyword と Token::Primitive(LiteralString) は別バリアントのため != になることを確認する
        assert_ne!(
            Token::Keyword(b"R".to_vec()),
            Token::Primitive(Primitive::LiteralString(b"R".to_vec()))
        );
    }

    #[test]
    fn token_keyword_and_primitive_name_with_same_bytes_are_not_equal() {
        // 同一バイト内容でも Token::Keyword と Token::Primitive(Name) は別バリアントのため != になることを確認する
        assert_ne!(
            Token::Keyword(b"Type".to_vec()),
            Token::Primitive(Primitive::Name(PdfName::from("Type")))
        );
    }
}
