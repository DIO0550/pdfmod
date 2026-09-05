//! PDF 字句解析の出力となるトークン型 `Token` および値トークンの内部表現 `Primitive` を
//! 定義するモジュール。
//!
//! ISO 32000-1 §7.2 のレキシカル規約（`docs/specs/01_lexical_conventions.md`）と
//! §7.3 のオブジェクト型分類、実装ガイド（`docs/specs/09_implementation_guide.md` §2.2）に
//! 基づき、§7.3 のスカラ系プリミティブ 7 種を `Primitive` sub-enum に集約し、
//! `Token` 本体は `Primitive(Primitive)` ラッパに加えて配列・辞書・obj/endobj・
//! stream/endstream の構造制御トークン 8 個、既知キーワードの有限集合を表す `Keyword` と
//! 無検証バイト列の `Comment` の計 11 バリアントで字句種別を表す。構築は無検証で、
//! 意味解釈・正規化は上位（parser）に委譲する。`N G R` の 3 字句から `IndirectRef` を
//! 組み立てるのは parser 層の責務であり、本モジュールでは `R` を `Keyword(Keyword::R)`
//! として平坦に流す。

use crate::lexer::token_kind::TokenKind;
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
    /// （`PdfString` と同方針）。
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
    /// ヒープ保持のため参照返し（`PdfObject::as_string_bytes` と同方針）。
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

/// PDF の字句として現れる既知キーワードの有限集合（ISO 32000-1 §7.3.10 / §7.5.4 / §7.5.5）。
///
/// `true` / `false` / `null` / `obj` / `endobj` / `stream` / `endstream` は
/// [`Token`] の専用バリアントに割り当てられているため、ここには含まれない。
/// 本 enum が表すのは「専用バリアントを持たないが綴りが確定している」キーワードだけである。
///
/// 綴りの**唯一の定義点**は [`Keyword::as_bytes`]。照合（[`Keyword::from_bytes`]）も
/// そこから導出するため、バイト列リテラルが 2 箇所に分かれて片方だけ綴りを間違える
/// 事故が起きない（`TrailerKey` と同じ方針）。
///
/// 既知バリアントはデータを持たないため、字句解析時にヒープ確保が発生しない。
/// [`Keyword::Unknown`] だけが収集バイト列を保持する。lexer は意味解釈を行わず、
/// 既知集合に無い regular バイト列は無検証のまま `Unknown` で上位に委譲する。
///
/// `Unknown(Vec<u8>)` がヒープを持つため `Copy` は不可。`Vec<u8>` は `Eq` を満たすので
/// `Token` と違い `Eq` を derive できる（`Token` が `Eq` を持てないのは
/// `Primitive::Real(f64)` の NaN 伝播が理由であり、本 enum はその制約を受けない）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Keyword {
    /// `R` — 間接参照 `N G R` の 3 字句目（ISO 32000-1 §7.3.10）。
    ///
    /// `N G R` から [`crate::object::indirect_ref::IndirectRef`] を組み立てるのは
    /// parser の責務であり、本層では単独の字句として平坦に流す。
    R,
    /// `xref` — 従来型 xref テーブルの開始（ISO 32000-1 §7.5.4）。
    Xref,
    /// `trailer` — 従来形式トレイラの開始（ISO 32000-1 §7.5.5）。
    Trailer,
    /// `startxref` — 最初に読む xref テーブルのオフセットを導入する（ISO 32000-1 §7.5.5）。
    StartXref,
    /// 既知集合に無い regular バイト列（`f` / `n` / `True` / `OBJ` / `trueX` / `123abc` など）。
    ///
    /// UTF-8 は仮定せず、NUL・非 UTF-8・高位バイトも無検証で忠実に保持する
    /// （変更前の `Token::Keyword(Vec<u8>)` と同じ扱い）。
    Unknown(Vec<u8>),
}

impl Keyword {
    /// バイト列表現を持つ既知バリアントの全体。[`Self::from_bytes`] の照合対象。
    ///
    /// ここに新しいキーワードを足したら [`Self::as_bytes`] にも綴りを足す
    /// （逆に言えば、足し忘れると照合されないだけで綴りは 1 箇所のまま保たれる）。
    const KNOWN: [Self; 4] = [Self::R, Self::Xref, Self::Trailer, Self::StartXref];

    /// 収集済みバイト列から対応するキーワードを判定する。既知集合に無ければ
    /// [`Self::Unknown`] に倒す全域関数。
    ///
    /// case-sensitive で照合する（`R` は既知、`r` / `XREF` / `Trailer` は `Unknown`）。
    /// 既知に一致した場合はヒープ確保が発生せず、`Unknown` に落ちた場合のみ
    /// `bytes.to_vec()` で複製する。
    #[must_use]
    pub fn from_bytes(bytes: &[u8]) -> Self {
        Self::KNOWN
            .into_iter()
            .find(|keyword| keyword.as_bytes() == bytes)
            .unwrap_or_else(|| Self::Unknown(bytes.to_vec()))
    }

    /// キーワードのバイト列表現を返す。
    ///
    /// 既知キーワードの綴りの**唯一の定義点**。[`Self::Unknown`] の場合は
    /// 保持している収集バイト列をそのまま返す。
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        match self {
            Self::R => b"R",
            Self::Xref => b"xref",
            Self::Trailer => b"trailer",
            Self::StartXref => b"startxref",
            Self::Unknown(bytes) => bytes.as_slice(),
        }
    }
}

/// PDF レキシカル層の出力トークン（§7.2 / §7.3 全体に対応）。
///
/// `Primitive` ラッパ 1 個 + 構造制御トークン 8 個 + `Keyword` / `Comment` の計 11 バリアントで構成される。
/// 内部に `Primitive` を含むため `Eq`/`Hash`/`Ord` は derive 不可（NaN 伝播）。
/// `Keyword(Keyword::Unknown)` / `Comment(Vec<u8>)` / `Primitive` ラップのヒープにより `Copy` 不可。
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
    /// キーワード字句（[`Keyword`]）。既知の有限集合と、それ以外の無検証バイト列を表す。
    ///
    /// `N G R` の 3 字句から間接参照を組み立てるのは parser の責務であり、
    /// 本層では `R` も単独 `Keyword(Keyword::R)` として平坦に流す。意味解釈は上位
    /// パーサに委譲し、既知集合に無い綴りは UTF-8 を仮定せず
    /// [`Keyword::Unknown`] で生バイトのまま保持する。
    Keyword(Keyword),
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

    /// `Keyword` のとき内部の [`Keyword`] を `Some` で取り出す（他は `None`）。
    ///
    /// ヒープを持ちうるため参照返し。`R` 単独識別は
    /// `matches!(tok.as_keyword(), Some(Keyword::R))` のように検査する。
    /// バイト列表現が必要な場合は [`Keyword::as_bytes`] を重ねる。
    pub fn as_keyword(&self) -> Option<&Keyword> {
        match self {
            Self::Keyword(keyword) => Some(keyword),
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

    /// バリアント種別を [`TokenKind`] として返す。
    ///
    /// `Primitive` の内側の種別（Integer / Real / Name 等）は区別せず、
    /// まとめて [`TokenKind::Primitive`] にする。
    /// `ParseErrorKind::UnexpectedToken` に「実際に来たトークン」を載せるために使う。
    #[must_use]
    pub fn kind(&self) -> TokenKind {
        match self {
            Self::Primitive(_) => TokenKind::Primitive,
            Self::ArrayBegin => TokenKind::ArrayBegin,
            Self::ArrayEnd => TokenKind::ArrayEnd,
            Self::DictBegin => TokenKind::DictBegin,
            Self::DictEnd => TokenKind::DictEnd,
            Self::ObjBegin => TokenKind::ObjBegin,
            Self::ObjEnd => TokenKind::ObjEnd,
            Self::StreamBegin => TokenKind::StreamBegin,
            Self::StreamEnd => TokenKind::StreamEnd,
            Self::Keyword(_) => TokenKind::Keyword,
            Self::Comment(_) => TokenKind::Comment,
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
        // ArrayBegin 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_array_begin() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_array_begin());
        }
    }

    #[test]
    fn token_is_array_end_returns_false_for_non_array_end_variants() {
        // ArrayEnd 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_array_end() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_array_end());
        }
    }

    #[test]
    fn token_is_dict_begin_returns_false_for_non_dict_begin_variants() {
        // DictBegin 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_dict_begin() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_dict_begin());
        }
    }

    #[test]
    fn token_is_dict_end_returns_false_for_non_dict_end_variants() {
        // DictEnd 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_dict_end() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_dict_end());
        }
    }

    #[test]
    fn token_is_obj_begin_returns_false_for_non_obj_begin_variants() {
        // ObjBegin 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_obj_begin() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_obj_begin());
        }
    }

    #[test]
    fn token_is_obj_end_returns_false_for_non_obj_end_variants() {
        // ObjEnd 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_obj_end() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_obj_end());
        }
    }

    #[test]
    fn token_is_stream_begin_returns_false_for_non_stream_begin_variants() {
        // StreamBegin 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_stream_begin() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
        ] {
            assert!(!t.is_stream_begin());
        }
    }

    #[test]
    fn token_is_stream_end_returns_false_for_non_stream_end_variants() {
        // StreamEnd 以外の全 10 バリアント（構造制御 7 + Primitive/Keyword/Comment）で is_stream_end() が false を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
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
        // Primitive 以外の全 10 バリアント（構造制御 8 + Keyword + Comment）では as_primitive() が None を返すことを確認する
        for t in &[
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
            Token::Comment(b"x".to_vec()),
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
        // Token::Keyword(Keyword::Xref) を構築し matches! で Keyword 腕に入ることを確認する
        let t = Token::Keyword(Keyword::Xref);
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
        // Token::Keyword(Keyword::Xref) に as_keyword() を呼ぶと Some(&Keyword::Xref) を返すことを確認する
        assert_eq!(
            Token::Keyword(Keyword::Xref).as_keyword(),
            Some(&Keyword::Xref)
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
        // Keyword 以外の全 10 バリアント（Primitive + 構造制御 8 + Comment）では as_keyword() が None を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Comment(b"x".to_vec()),
        ] {
            assert_eq!(t.as_keyword(), None);
        }
    }

    #[test]
    fn token_as_comment_returns_none_for_non_comment_variants() {
        // Comment 以外の全 10 バリアント（Primitive + 構造制御 8 + Keyword）では as_comment() が None を返すことを確認する
        for t in &[
            Token::Primitive(Primitive::Null),
            Token::ArrayBegin,
            Token::ArrayEnd,
            Token::DictBegin,
            Token::DictEnd,
            Token::ObjBegin,
            Token::ObjEnd,
            Token::StreamBegin,
            Token::StreamEnd,
            Token::Keyword(Keyword::Xref),
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
        assert_eq!(Token::Keyword(Keyword::Xref), Token::Keyword(Keyword::Xref));
    }

    #[test]
    fn token_different_content_keywords_are_not_equal() {
        // 異内容の Keyword 同士は != で非等価になることを確認する
        assert_ne!(
            Token::Keyword(Keyword::Xref),
            Token::Keyword(Keyword::Trailer)
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
            Token::Keyword(Keyword::Xref),
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
        let original_kw = Token::Keyword(Keyword::Unknown(b"xrefs".to_vec()));
        let cloned_kw = original_kw.clone();
        assert_eq!(
            cloned_kw.as_keyword(),
            Some(&Keyword::Unknown(b"xrefs".to_vec()))
        );
        assert_eq!(
            original_kw.as_keyword(),
            Some(&Keyword::Unknown(b"xrefs".to_vec()))
        );

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
        assert!(format!("{:?}", Token::Keyword(Keyword::Xref)).contains("Keyword"));
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
    fn token_as_keyword_returns_empty_unknown_for_empty_keyword() {
        // 空バイト列の Token::Keyword(Keyword::Unknown(b"")) は as_keyword() で
        // Some(&Keyword::Unknown(空バイト列)) を返すことを確認する
        assert_eq!(
            Token::Keyword(Keyword::Unknown(b"".to_vec())).as_keyword(),
            Some(&Keyword::Unknown(b"".to_vec()))
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
        // Token::Keyword(Keyword::Unknown(vec![0x00, 0x80, 0xFF])) を as_keyword() で
        // 取り出すと保持バイト列が忠実に返ることを確認する
        let t = Token::Keyword(Keyword::Unknown(vec![0x00, 0x80, 0xFF]));
        assert_eq!(
            t.as_keyword().map(Keyword::as_bytes),
            Some([0x00, 0x80, 0xFF].as_slice())
        );
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
            Token::Keyword(Keyword::R),
            Token::Primitive(Primitive::LiteralString(b"R".to_vec()))
        );
    }

    #[test]
    fn token_keyword_and_primitive_name_with_same_bytes_are_not_equal() {
        // 同一バイト内容でも Token::Keyword と Token::Primitive(Name) は別バリアントのため != になることを確認する
        assert_ne!(
            Token::Keyword(Keyword::Unknown(b"Type".to_vec())),
            Token::Primitive(Primitive::Name(PdfName::from("Type")))
        );
    }

    #[test]
    fn kind_returns_matching_token_kind_for_every_variant() {
        // 全 11 バリアントの kind() が対応する TokenKind を返すことを確認する
        let cases: [(Token, TokenKind); 11] = [
            (Token::Primitive(Primitive::Null), TokenKind::Primitive),
            (Token::ArrayBegin, TokenKind::ArrayBegin),
            (Token::ArrayEnd, TokenKind::ArrayEnd),
            (Token::DictBegin, TokenKind::DictBegin),
            (Token::DictEnd, TokenKind::DictEnd),
            (Token::ObjBegin, TokenKind::ObjBegin),
            (Token::ObjEnd, TokenKind::ObjEnd),
            (Token::StreamBegin, TokenKind::StreamBegin),
            (Token::StreamEnd, TokenKind::StreamEnd),
            (Token::Keyword(Keyword::R), TokenKind::Keyword),
            (Token::Comment(b"comment".to_vec()), TokenKind::Comment),
        ];

        for (token, expected) in cases {
            assert_eq!(token.kind(), expected, "token: {token:?}");
        }
    }

    #[test]
    fn kind_returns_primitive_regardless_of_inner_primitive_type() {
        // Primitive の内側が Integer / Real / Name いずれでも TokenKind::Primitive にまとまる契約を固定する
        let tokens = [
            Token::Primitive(Primitive::Integer(42)),
            Token::Primitive(Primitive::Real(1.5)),
            Token::Primitive(Primitive::Name(PdfName::from("Type"))),
        ];

        for token in tokens {
            assert_eq!(token.kind(), TokenKind::Primitive, "token: {token:?}");
        }
    }

    // ---------- Keyword: from_bytes ----------

    #[test]
    fn keyword_from_bytes_maps_known_spellings_to_known_variants() {
        // 既知 4 綴りが対応するバリアントに写ることを確認する
        let cases: [(&[u8], Keyword); 4] = [
            (b"R", Keyword::R),
            (b"xref", Keyword::Xref),
            (b"trailer", Keyword::Trailer),
            (b"startxref", Keyword::StartXref),
        ];

        for (bytes, expected) in cases {
            assert_eq!(Keyword::from_bytes(bytes), expected, "bytes: {bytes:?}");
        }
    }

    #[test]
    fn keyword_from_bytes_maps_case_variants_to_unknown() {
        // case-sensitive 照合により大文字小文字違いが Unknown へ落ちることを確認する
        let cases: [&[u8]; 4] = [b"r", b"XREF", b"Trailer", b"STARTXREF"];

        for bytes in cases {
            assert_eq!(
                Keyword::from_bytes(bytes),
                Keyword::Unknown(bytes.to_vec()),
                "bytes: {bytes:?}"
            );
        }
    }

    #[test]
    fn keyword_from_bytes_maps_partial_and_concatenated_spellings_to_unknown() {
        // 既知綴りへの連結・部分一致が Unknown へ落ちることを確認する
        let cases: [&[u8]; 4] = [b"Rx", b"xrefs", b"trailerX", b"start"];

        for bytes in cases {
            assert_eq!(
                Keyword::from_bytes(bytes),
                Keyword::Unknown(bytes.to_vec()),
                "bytes: {bytes:?}"
            );
        }
    }

    #[test]
    fn keyword_from_bytes_maps_empty_bytes_to_empty_unknown() {
        // 空バイト列（read_keyword からは到達しないが全域関数として）が Unknown になることを確認する
        assert_eq!(Keyword::from_bytes(b""), Keyword::Unknown(Vec::new()));
    }

    #[test]
    fn keyword_from_bytes_preserves_non_utf8_bytes_in_unknown() {
        // 非 UTF-8 / NUL / 高位バイトを含む列が Unknown に忠実に保持されることを確認する
        assert_eq!(
            Keyword::from_bytes(&[0xFF, 0x00, 0x80]),
            Keyword::Unknown(vec![0xFF, 0x00, 0x80])
        );
    }

    // ---------- Keyword: as_bytes ----------

    #[test]
    fn keyword_as_bytes_returns_spelling_for_known_variants() {
        // 既知 4 バリアントが対応する綴りを返すことを確認する
        let cases: [(Keyword, &[u8]); 4] = [
            (Keyword::R, b"R"),
            (Keyword::Xref, b"xref"),
            (Keyword::Trailer, b"trailer"),
            (Keyword::StartXref, b"startxref"),
        ];

        for (keyword, expected) in cases {
            assert_eq!(keyword.as_bytes(), expected, "keyword: {keyword:?}");
        }
    }

    #[test]
    fn keyword_as_bytes_returns_held_bytes_for_unknown() {
        // Unknown は保持している収集バイト列をそのまま返すことを確認する
        assert_eq!(Keyword::Unknown(b"foo".to_vec()).as_bytes(), b"foo");
    }

    // ---------- Keyword: 往復一致 ----------

    #[test]
    fn keyword_from_bytes_and_as_bytes_round_trip_for_known_variants() {
        // 既知バリアント全件で from_bytes(kw.as_bytes()) == kw が成り立つことを確認する
        // （将来バリアントを足したときの KNOWN / as_bytes の綴り不一致を検出する）
        let cases = [
            Keyword::R,
            Keyword::Xref,
            Keyword::Trailer,
            Keyword::StartXref,
        ];

        for keyword in cases {
            assert_eq!(
                Keyword::from_bytes(keyword.as_bytes()),
                keyword,
                "keyword: {keyword:?}"
            );
        }
    }

    // ---------- Keyword: Eq ----------

    #[test]
    fn keyword_unknown_with_same_bytes_are_equal() {
        // 同じバイト列を保持する Unknown 同士が等価になることを確認する
        assert_eq!(
            Keyword::Unknown(b"foo".to_vec()),
            Keyword::Unknown(b"foo".to_vec())
        );
    }

    #[test]
    fn keyword_unknown_with_different_bytes_are_not_equal() {
        // 異なるバイト列を保持する Unknown 同士が非等価になることを確認する
        assert_ne!(
            Keyword::Unknown(b"foo".to_vec()),
            Keyword::Unknown(b"bar".to_vec())
        );
    }

    #[test]
    fn keyword_known_variant_and_unknown_with_same_bytes_are_not_equal() {
        // 既知バリアントと同じ綴りを保持する Unknown はバリアントが異なるため非等価になることを確認する
        assert_ne!(Keyword::Xref, Keyword::Unknown(b"xref".to_vec()));
    }
}
