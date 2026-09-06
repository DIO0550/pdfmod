//! PDF の間接オブジェクト定義（`N G obj … endobj`）を表す `IndirectObject` を定義するモジュール。
//!
//! ヘッダの `ObjectId`（オブジェクト番号 + 世代番号）と `obj`〜`endobj` 間の
//! 単一 `PdfObject`（content）を組にした値ラッパ。オブジェクト解決（Epic R2）が
//! ファイル内オフセットから読み出した 1 定義の受け皿となる。生成は無検証
//! （infallible）で、番号の妥当性検証は xref レイヤに委譲する（ISO 32000-1 §7.3.10）。

use crate::object::object_id::ObjectId;
use crate::object::pdf_object::PdfObject;

/// PDF の間接オブジェクト定義（`N G obj … endobj`）。`ObjectId` と content の
/// `PdfObject` を内包する値ラッパ。
///
/// content の `PdfObject` がヒープ保持バリアント（String/Array/Dictionary/…）と
/// `Real(f64)` を含むため、derive は `Debug, Clone, PartialEq` のみ
/// （`Copy`/`Eq`/`Hash`/`Ord` は付けない。`pdf_object.rs` の derive 制約を継承）。
/// 同型テンプレートは `stream.rs` の `PdfStream`（非 Copy・2 フィールド・ヒープ保持・
/// 同一 derive・参照返しアクセサ）。`IndirectRef` は単一フィールド・`Copy` 付きで構造が遠い。
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub struct IndirectObject {
    id: ObjectId,
    object: PdfObject,
}

impl IndirectObject {
    /// `ObjectId` と content `PdfObject` から `IndirectObject` を生成する。
    ///
    /// 無検証（infallible）。`object` は所有ムーブで受け取り clone しない。
    pub fn new(id: ObjectId, object: PdfObject) -> Self {
        Self { id, object }
    }

    /// ヘッダの `ObjectId` を `Copy` で取り出す。
    pub fn id(&self) -> ObjectId {
        self.id
    }

    /// content の `PdfObject` を参照で取り出す（ヒープ保持のため clone を避ける）。
    pub fn object(&self) -> &PdfObject {
        &self.object
    }

    /// `self` を消費して `ObjectId` と content の `PdfObject` を所有権ごと分解する。
    ///
    /// 後続の R2 リゾルバが content（`PdfObject`）をムーブで所有取得する用途を想定
    /// （格納済み値のムーブ返しで追加コピーなし・clone なし）。参照取得で足りる場合は
    /// `id()` / `object()` を使う（姉妹型 `PdfStream::into_parts` と同方針）。
    pub fn into_parts(self) -> (ObjectId, PdfObject) {
        (self.id, self.object)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::object::dictionary::PdfDictionary;
    use crate::object::generation_number::GenerationNumber;
    use crate::object::indirect_ref::IndirectRef;
    use crate::object::name::PdfName;
    use crate::object::object_number::ObjectNumber;
    use crate::object::string::PdfString;

    /// `(n, g)` から `ObjectId` を組み立てるテスト用小ヘルパ。
    fn oid(n: u64, g: u16) -> ObjectId {
        ObjectId::new(
            ObjectNumber::new(n).expect("positive object number"),
            GenerationNumber::new(g),
        )
    }

    #[test]
    fn new_then_accessors_roundtrip() {
        // 代表 `(n,g)` + Integer content を `new` に包み `id()`/`object()` で取り出すと入力と一致する（ラウンドトリップ・無損失）。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Integer(42));
        assert_eq!(io.id(), oid(1, 0));
        assert_eq!(io.object(), &PdfObject::Integer(42));
    }

    #[test]
    fn id_returns_copy_and_stays_usable() {
        // `id()` は `Copy` 値返しのため複数回呼んでも元の `IndirectObject` を使い続けられ、両呼び出しが等価。
        let io = IndirectObject::new(oid(7, 3), PdfObject::Boolean(true));
        let first = io.id();
        let second = io.id();
        assert_eq!(first, second);
        assert_eq!(io.object(), &PdfObject::Boolean(true));
    }

    #[test]
    fn object_returns_reference_to_content() {
        // `object()` は参照返しで、内包 content と `==` で一致する（借用経路で内容へ到達できる）。
        let io = IndirectObject::new(oid(2, 0), PdfObject::Integer(9));
        let reference: &PdfObject = io.object();
        assert_eq!(reference, &PdfObject::Integer(9));
    }

    #[test]
    fn into_parts_decomposes_ownership() {
        // `into_parts()` で `(id, object)` を所有取り出し（消費・ムーブ）すると、構築時の入力と一致する（無損失ムーブ・clone なし）。
        let io = IndirectObject::new(oid(12, 0), PdfObject::String(PdfString::literal(b"body")));
        let (id, object) = io.into_parts();
        assert_eq!(id, oid(12, 0));
        assert_eq!(object, PdfObject::String(PdfString::literal(b"body")));
    }

    #[test]
    fn clone_preserves_content_and_keeps_original_usable() {
        // `clone()` の複製が元と `==` 等価かつ元も引き続き使用可能（深いコピー・独立性）。
        let original = IndirectObject::new(oid(5, 1), PdfObject::Integer(100));
        let cloned = original.clone();
        assert_eq!(cloned, original);
        assert_eq!(original.object(), &PdfObject::Integer(100));
    }

    #[test]
    fn same_id_and_content_are_equal() {
        // 同 id・同 content の 2 値は `==` で等価（`PartialEq` が両フィールドに委譲）。
        let a = IndirectObject::new(oid(3, 0), PdfObject::Integer(1));
        let b = IndirectObject::new(oid(3, 0), PdfObject::Integer(1));
        assert_eq!(a, b);
    }

    #[test]
    fn not_equal_when_object_number_differs() {
        // generation・content が同一で object_number のみ異なる 2 値は `!=` 非等価（object_number 軸の差異が反映される）。
        let a = IndirectObject::new(oid(3, 0), PdfObject::Integer(1));
        let b = IndirectObject::new(oid(4, 0), PdfObject::Integer(1));
        assert_ne!(a, b);
    }

    #[test]
    fn not_equal_when_generation_differs() {
        // object_number・content が同一で generation のみ異なる 2 値は `!=` 非等価（generation 軸の差異が反映される）。
        let a = IndirectObject::new(oid(3, 0), PdfObject::Integer(1));
        let b = IndirectObject::new(oid(3, 1), PdfObject::Integer(1));
        assert_ne!(a, b);
    }

    #[test]
    fn not_equal_when_content_differs() {
        // 同 id で content が `Integer(1)` vs `Integer(2)` の 2 値は `!=` 非等価（content 軸の差異が反映される）。
        let a = IndirectObject::new(oid(3, 0), PdfObject::Integer(1));
        let b = IndirectObject::new(oid(3, 0), PdfObject::Integer(2));
        assert_ne!(a, b);
    }

    #[test]
    fn nan_content_propagates_to_inequality() {
        // 同 id で content が `Real(f64::NAN)` の 2 値は `!=` 非等価（`NaN != NaN` の伝播。`Eq` 非実装の帰結）。
        let a = IndirectObject::new(oid(3, 0), PdfObject::Real(f64::NAN));
        let b = IndirectObject::new(oid(3, 0), PdfObject::Real(f64::NAN));
        assert_ne!(a, b);
    }

    #[test]
    fn debug_format_contains_type_name() {
        // `Debug` 出力に型名 `IndirectObject` を含む。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Null);
        assert!(format!("{:?}", io).contains("IndirectObject"));
    }

    #[test]
    fn accepts_min_boundary_object_id() {
        // 最小境界 `ObjectId(1, 0)` を受理し、ラウンドトリップが成立する。
        // オブジェクト番号の下限は #334 以降 1（ISO 32000-1 §7.3.10 の正整数）。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Null);
        assert_eq!(io.id().object_number().value(), 1);
        assert_eq!(io.id().generation_number().value(), 0);
        assert_eq!(io.object(), &PdfObject::Null);
    }

    #[test]
    fn accepts_max_boundary_object_id() {
        // 最大境界 `ObjectId(u64::MAX, u16::MAX)` を無検証で受理し、番号/世代がともに MAX でラウンドトリップが成立する。
        let io = IndirectObject::new(oid(u64::MAX, u16::MAX), PdfObject::Null);
        assert_eq!(io.id().object_number().value(), u64::MAX);
        assert_eq!(io.id().generation_number().value(), u16::MAX);
    }

    #[test]
    fn content_preserves_null() {
        // content `Null` を無損失で保持し `object()` が `&Null` を返す。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Null);
        assert_eq!(io.object(), &PdfObject::Null);
    }

    #[test]
    fn content_preserves_boolean() {
        // content `Boolean(true)` を無損失で保持し `object()` が `&Boolean(true)` を返す。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Boolean(true));
        assert_eq!(io.object(), &PdfObject::Boolean(true));
    }

    #[test]
    fn content_preserves_integer() {
        // content `Integer(-7)` を無損失で保持し `object()` が `&Integer(-7)` を返す。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Integer(-7));
        assert_eq!(io.object(), &PdfObject::Integer(-7));
    }

    #[test]
    fn content_preserves_real() {
        // content `Real(2.5)` を無損失で保持し `object()` が `&Real(2.5)` を返す。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Real(2.5));
        assert_eq!(io.object(), &PdfObject::Real(2.5));
    }

    #[test]
    fn content_preserves_string() {
        // content `String(b"abc")` を無損失で保持し `object()` が同一バイト列の `&String` を返す。
        let io = IndirectObject::new(oid(1, 0), PdfObject::String(PdfString::literal(b"abc")));
        assert_eq!(io.object(), &PdfObject::String(PdfString::literal(b"abc")));
    }

    #[test]
    fn content_preserves_name() {
        // content `Name("Page")` を無損失で保持し `object()` が同名の `&Name` を返す。
        let io = IndirectObject::new(oid(1, 0), PdfObject::Name(PdfName::from("Page")));
        assert_eq!(io.object(), &PdfObject::Name(PdfName::from("Page")));
    }

    #[test]
    fn content_preserves_array() {
        // content `Array[Integer(1), Integer(2)]` を無損失で保持し `object()` が同一配列の `&Array` を返す。
        let items = vec![PdfObject::Integer(1), PdfObject::Integer(2)];
        let io = IndirectObject::new(oid(1, 0), PdfObject::Array(items.clone()));
        assert_eq!(io.object(), &PdfObject::Array(items));
    }

    #[test]
    fn content_preserves_dictionary() {
        // content `Dictionary{/Type→Name("Page")}` を無損失で保持し `object()` が同一辞書の `&Dictionary` を返す。
        let mut dict = PdfDictionary::new();
        dict.insert(
            PdfName::from("Type"),
            PdfObject::Name(PdfName::from("Page")),
        );
        let io = IndirectObject::new(oid(1, 0), PdfObject::Dictionary(dict.clone()));
        assert_eq!(io.object(), &PdfObject::Dictionary(dict));
    }

    #[test]
    fn content_preserves_reference() {
        // content `Reference(15, 0)` を無損失で保持し `object()` が同一参照の `&Reference` を返す。
        let reference = IndirectRef::new(oid(15, 0));
        let io = IndirectObject::new(oid(1, 0), PdfObject::Reference(reference));
        assert_eq!(io.object(), &PdfObject::Reference(reference));
    }
}
