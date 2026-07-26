//! PDF 基本オブジェクトの中核 `PdfObject` を定義するモジュール。
//!
//! ISO 32000-1 §7.3 の PDF オブジェクトを 1 つの enum で表す。現時点では
//! スカラ系 4 バリアント（Null / Boolean / Integer / Real）に加え、文字列
//! （復号後の生バイト列）・名前（`PdfName`）・配列（`Vec<PdfObject>` の自己再帰）・
//! 辞書（`PdfDictionary`）・ストリーム（`PdfStream`）・参照（`IndirectRef`）を定義する。
//! 構築は無検証（infallible）で、テキスト解釈や妥当性検証・正規化は上位
//! （lexer/parser）に委譲する。

use crate::object::dictionary::PdfDictionary;
use crate::object::indirect_ref::IndirectRef;
use crate::object::name::PdfName;
use crate::object::stream::PdfStream;

/// PDF 基本オブジェクト（スカラ系・文字列・名前・配列・辞書・ストリーム・参照バリアントを表す enum）。
///
/// 整数幅は `i64`、浮動小数点幅は `f64`（PDF パーサで最も一般的・桁あふれ耐性・
/// 後続レクサーとの相性で確定）。`Real(f64)` を含むため `Eq`/`Hash`/`Ord` は
/// derive できない（IEEE 754: `NaN != NaN`）。`Copy` も付けない（後続のヒープ
/// 保持バリアント追加で必ず外れ、撤回が破壊的変更になるため最初から付けず API を
/// 安定させる）。`PartialOrd` も付けない（PDF オブジェクト間に意味ある全順序は
/// なく、`PdfErrorCode` 同様に用途上不要）。よって derive は `Debug, Clone,
/// PartialEq` のみ。
#[derive(Debug, Clone, PartialEq)]
pub enum PdfObject {
    /// null オブジェクト（値の不在）。
    Null,
    /// 真偽値オブジェクト（`true` / `false`）。
    Boolean(bool),
    /// 整数オブジェクト（`i64`、`i64::MIN..=i64::MAX` を無検証で保持）。
    Integer(i64),
    /// 実数オブジェクト（`f64`、`NaN`/`±0.0`/`Inf` を無検証で保持）。
    Real(f64),
    /// 文字列オブジェクト（**復号後** の生バイト列を保持）。
    ///
    /// テキストエンコーディングを仮定せず、リテラル文字列のエスケープや
    /// 16進文字列のデコードは lexer の責務とする（`PdfName` と同方針）。
    /// 妥当性検証は上位に委譲し、NUL/非UTF-8/空バイト列も無検証で忠実に保持する。
    String(Vec<u8>),
    /// 名前オブジェクト（`/Name` 本体）。`PdfName`（#261）をそのまま内包する。
    Name(PdfName),
    /// 配列オブジェクト（順序付きオブジェクトリスト）。
    ///
    /// 専用ラッパ型を設けず `Vec<PdfObject>` を直接保持し、`PdfObject` の
    /// 自己再帰によりネスト（配列内に配列・辞書など）を表現する。妥当性検証や
    /// 正規化は行わず、空配列も無検証で忠実に保持する。要素に `Real(NaN)` を
    /// 含むと `NaN != NaN` が配列全体に伝播し、配列同士は `==` で非等価になる。
    Array(Vec<PdfObject>),
    /// 辞書オブジェクト。`PdfDictionary`（#264）をそのまま内包する。
    ///
    /// 値型 `PdfObject` を介して配列・辞書を値に持つ多段ネストを表現する。
    /// 値に `Real(NaN)` を含むと辞書同士は `==` で非等価になる（`Eq` 非実装の
    /// 根拠が再帰的に維持される）。
    Dictionary(PdfDictionary),
    /// ストリームオブジェクト。`PdfStream`（#267）をそのまま内包する。
    ///
    /// 生バイトは無検証・無復号で忠実に保持し、フィルタ復号や `/Length` 整合性
    /// 検証は後続フェーズ（lexer/parser 層）に委譲する。ISO 32000-1 §7.3.8 の
    /// 「stream は間接オブジェクトでなければならない」という制約は本 enum では
    /// 型表現せず、上位レイヤで担保する。辞書部の値に `Real(NaN)` を含むと
    /// ストリーム同士は `==` で非等価になる（`Eq` 非実装の根拠が再帰的に維持される）。
    Stream(PdfStream),
    /// 間接参照オブジェクト（`N G R`）。`IndirectRef`（#266）をそのまま内包する。
    ///
    /// `IndirectRef` は `Copy` 値型（ヒープ確保なし）。参照先の存在・妥当性
    /// 検証は行わず、無検証で忠実に保持する（解決は xref レイヤ R2 に委譲）。
    Reference(IndirectRef),
}

impl PdfObject {
    /// `Null` バリアントかどうかを返す述語。
    ///
    /// `Null` のとき `true`、他バリアントでは `false`。
    pub fn is_null(&self) -> bool {
        matches!(self, Self::Null)
    }

    /// `Boolean` のとき内部の `bool` を `Some` で取り出す（他は `None`）。
    pub fn as_bool(&self) -> Option<bool> {
        match self {
            Self::Boolean(b) => Some(*b),
            _ => None,
        }
    }

    /// `Integer` のとき内部の `i64` を `Some` で取り出す（他は `None`）。
    pub fn as_integer(&self) -> Option<i64> {
        match self {
            Self::Integer(n) => Some(*n),
            _ => None,
        }
    }

    /// `Real` のとき内部の `f64` を `Some` で取り出す（他は `None`）。
    pub fn as_real(&self) -> Option<f64> {
        match self {
            Self::Real(r) => Some(*r),
            _ => None,
        }
    }

    /// `String` のとき内部のバイト列を `&[u8]` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`PdfName::as_bytes` と同方針）。
    pub fn as_string_bytes(&self) -> Option<&[u8]> {
        match self {
            Self::String(bytes) => Some(bytes.as_slice()),
            _ => None,
        }
    }

    /// `Name` のとき内部の `PdfName` を `&PdfName` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`PdfName::as_bytes` と同方針）。
    pub fn as_name(&self) -> Option<&PdfName> {
        match self {
            Self::Name(name) => Some(name),
            _ => None,
        }
    }

    /// `Array` のとき内部の要素列を `&[PdfObject]` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`as_string_bytes` の `as_slice()` と同方針）。
    pub fn as_array(&self) -> Option<&[PdfObject]> {
        match self {
            Self::Array(items) => Some(items.as_slice()),
            _ => None,
        }
    }

    /// `Dictionary` のとき内部の `PdfDictionary` を `&PdfDictionary` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`as_name` の `&PdfName` 返しと同方針）。
    pub fn as_dictionary(&self) -> Option<&PdfDictionary> {
        match self {
            Self::Dictionary(dict) => Some(dict),
            _ => None,
        }
    }

    /// `Stream` のとき内部の `PdfStream` を `&PdfStream` として `Some` で取り出す（他は `None`）。
    ///
    /// ヒープ保持のため参照返し（`as_dictionary` の `&PdfDictionary` 返しと同方針）。
    pub fn as_stream(&self) -> Option<&PdfStream> {
        match self {
            Self::Stream(stream) => Some(stream),
            _ => None,
        }
    }

    /// `Reference` のとき内部の `IndirectRef` を `Some` で取り出す（他は `None`）。
    ///
    /// `IndirectRef` は `Copy` なので値返し（`as_bool`/`as_integer` と同方針）。
    pub fn as_reference(&self) -> Option<IndirectRef> {
        match self {
            Self::Reference(r) => Some(*r),
            _ => None,
        }
    }
}

impl From<bool> for PdfObject {
    /// `bool` から `Boolean` バリアントを構築する変換経路。
    ///
    /// バリアント名を明示せずに `true.into()` と書け、`impl Into<PdfObject>` を
    /// 受け取る汎用 API を設計できるようにする目的で提供する。
    fn from(value: bool) -> PdfObject {
        PdfObject::Boolean(value)
    }
}

impl From<i64> for PdfObject {
    /// `i64` から `Integer` バリアントを構築する変換経路。
    ///
    /// 整数からの変換は `i64` のみを提供する。整数リテラルの `.into()` は現在
    /// 適用可能な impl が 1 つだけであるために一意に解決するが、`From<i32>` や
    /// `From<u32>` を追加すると候補が複数になり、既存の `42.into()` が
    /// 「type annotations needed」で壊れる。よって整数型の追加実装はしない。
    fn from(value: i64) -> PdfObject {
        PdfObject::Integer(value)
    }
}

impl From<f64> for PdfObject {
    /// `f64` から `Real` バリアントを構築する変換経路。
    ///
    /// 無検証であり、`NaN` / `±0.0` / `Inf` もそのまま保持する（正規化しない）。
    fn from(value: f64) -> PdfObject {
        PdfObject::Real(value)
    }
}

impl From<Vec<u8>> for PdfObject {
    /// 復号後の生バイト列から `String` バリアントを構築する変換経路。
    ///
    /// テキストエンコーディングを仮定せず、空バイト列・NUL・非 UTF-8 バイトを
    /// 無検証で忠実に保持する。
    ///
    /// `Vec<PdfObject>` からの変換と併存するため、要素型が未確定の空ベクタ
    /// （`vec![].into()` / `Vec::new().into()`）は候補が 2 つになり
    /// 「type annotations needed」で失敗する。空の文字列オブジェクトを作るときは
    /// `Vec::<u8>::new().into()` と要素型を明示するか、`PdfObject::String(Vec::new())`
    /// とバリアントを直接書く。
    fn from(bytes: Vec<u8>) -> PdfObject {
        PdfObject::String(bytes)
    }
}

impl From<PdfName> for PdfObject {
    /// `PdfName` から `Name` バリアントを構築する変換経路。
    ///
    /// `&str` からの変換は提供しない。`&str` は `String` バリアント（テキスト）と
    /// `Name` バリアント（`/Name` 本体）のどちらにも解釈でき、暗黙に一方を選ぶと
    /// 誤用を招くため。また `From` は連鎖しないので、`From<&str> for PdfName` が
    /// あっても `"Type".into()` は `PdfObject` にならない。名前オブジェクトは
    /// `PdfObject::from(PdfName::from("Type"))` と 2 段で明示的に書く。
    fn from(name: PdfName) -> PdfObject {
        PdfObject::Name(name)
    }
}

impl From<Vec<PdfObject>> for PdfObject {
    /// 要素列から `Array` バリアントを構築する変換経路。
    ///
    /// `Vec<u8>` からの変換と併存するため、要素型が未確定の空ベクタは
    /// 「type annotations needed」で失敗する。空配列は
    /// `Vec::<PdfObject>::new().into()` と要素型を明示するか、
    /// `PdfObject::Array(vec![])` とバリアントを直接書く。
    fn from(items: Vec<PdfObject>) -> PdfObject {
        PdfObject::Array(items)
    }
}

impl From<PdfDictionary> for PdfObject {
    /// `PdfDictionary` から `Dictionary` バリアントを構築する変換経路。
    fn from(dict: PdfDictionary) -> PdfObject {
        PdfObject::Dictionary(dict)
    }
}

impl From<PdfStream> for PdfObject {
    /// `PdfStream` から `Stream` バリアントを構築する変換経路。
    fn from(stream: PdfStream) -> PdfObject {
        PdfObject::Stream(stream)
    }
}

impl From<IndirectRef> for PdfObject {
    /// `IndirectRef` から `Reference` バリアントを構築する変換経路。
    ///
    /// 内包型を持たない `Null` にだけは `From` を提供できないため、構築用の
    /// 変換は本 impl を含む 9 バリアント分で全数となる。
    fn from(reference: IndirectRef) -> PdfObject {
        PdfObject::Reference(reference)
    }
}

#[cfg(test)]
mod tests;
