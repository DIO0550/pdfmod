//! [`PdfObject`](crate::object::pdf_object::PdfObject) のバリアント種別を表す判別タグ。
//!
//! 「期待した型と違う値が来た」ことを報告する各層のエラー
//! （`ParseErrorKind::InvalidLengthType` / `TrailerErrorKind::{NotADictionary, InvalidKeyType}` /
//! `EncryptErrorKind::InvalidKeyType`）で共通に使う。

use std::fmt;

/// `PdfObject` のバリアント種別（データを持たない判別タグ）。
///
/// `#[non_exhaustive]` は付けない。付けないことで `PdfObject` にバリアントを
/// 追加すると `PdfObject::kind` の `match` が非網羅となり、それを埋めるために
/// 本 enum へバリアントを足すと今度は [`Self::as_str`] が非網羅となる。
/// 追従漏れが 2 段のコンパイルエラーとして検出される（`PdfErrorCode` と同方針）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ObjectKind {
    /// [`PdfObject::Null`](crate::object::pdf_object::PdfObject::Null)
    Null,
    /// [`PdfObject::Boolean`](crate::object::pdf_object::PdfObject::Boolean)
    Boolean,
    /// [`PdfObject::Integer`](crate::object::pdf_object::PdfObject::Integer)
    Integer,
    /// [`PdfObject::Real`](crate::object::pdf_object::PdfObject::Real)
    Real,
    /// [`PdfObject::String`](crate::object::pdf_object::PdfObject::String)
    ///
    /// リテラル `(...)` と16進 `<...>` は区別しない（表記形式は `PdfString` の
    /// `encoding` が持つ粒度で、`ObjectKind` はバリアント種別だけを表す）。
    String,
    /// [`PdfObject::Name`](crate::object::pdf_object::PdfObject::Name)
    Name,
    /// [`PdfObject::Array`](crate::object::pdf_object::PdfObject::Array)
    Array,
    /// [`PdfObject::Dictionary`](crate::object::pdf_object::PdfObject::Dictionary)
    Dictionary,
    /// [`PdfObject::Stream`](crate::object::pdf_object::PdfObject::Stream)
    Stream,
    /// [`PdfObject::Reference`](crate::object::pdf_object::PdfObject::Reference)
    Reference,
}

impl ObjectKind {
    /// 種別を表す短い `'static` 識別子を返す。
    ///
    /// 文言は `PdfObject` のバリアント名と一致させる（ISO 32000 のオブジェクト型名に対応）。
    /// `PdfErrorCode::Display` の「小文字始まりの英語短文」はエラー文言用の慣習であり、
    /// 種別タグである本型には適用しない。
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Null => "Null",
            Self::Boolean => "Boolean",
            Self::Integer => "Integer",
            Self::Real => "Real",
            Self::String => "String",
            Self::Name => "Name",
            Self::Array => "Array",
            Self::Dictionary => "Dictionary",
            Self::Stream => "Stream",
            Self::Reference => "Reference",
        }
    }
}

/// 種別名のみを出力する（`"Integer"`。装飾は付けない）。
impl fmt::Display for ObjectKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.as_str(), f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 全 10 バリアントの as_str がバリアント名と同一の文字列を返すことを確認する
    #[test]
    fn as_str_returns_variant_name_for_every_variant() {
        let cases: [(ObjectKind, &str); 10] = [
            (ObjectKind::Null, "Null"),
            (ObjectKind::Boolean, "Boolean"),
            (ObjectKind::Integer, "Integer"),
            (ObjectKind::Real, "Real"),
            (ObjectKind::String, "String"),
            (ObjectKind::Name, "Name"),
            (ObjectKind::Array, "Array"),
            (ObjectKind::Dictionary, "Dictionary"),
            (ObjectKind::Stream, "Stream"),
            (ObjectKind::Reference, "Reference"),
        ];
        for (kind, expected) in cases {
            assert_eq!(kind.as_str(), expected, "kind: {kind:?}");
        }
    }

    // Display 出力が as_str と一致する（委譲されている）ことを確認する
    #[test]
    fn display_matches_as_str_for_every_variant() {
        let kinds = [
            ObjectKind::Null,
            ObjectKind::Boolean,
            ObjectKind::Integer,
            ObjectKind::Real,
            ObjectKind::String,
            ObjectKind::Name,
            ObjectKind::Array,
            ObjectKind::Dictionary,
            ObjectKind::Stream,
            ObjectKind::Reference,
        ];
        for kind in kinds {
            assert_eq!(format!("{kind}"), kind.as_str(), "kind: {kind:?}");
        }
    }

    // 異なるバリアント同士が PartialEq で区別されることを確認する
    #[test]
    fn distinct_variants_are_not_equal() {
        assert_ne!(ObjectKind::Integer, ObjectKind::Real);
    }

    // Copy で move されず、同一バリアント同士が等価であることを確認する
    #[test]
    fn same_variant_is_equal_and_copyable() {
        let kind = ObjectKind::Dictionary;
        let copied = kind;
        assert_eq!(kind, copied);
    }
}
