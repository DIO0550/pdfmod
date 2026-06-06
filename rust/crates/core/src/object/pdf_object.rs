//! PDF 基本オブジェクトの中核 `PdfObject` を定義するモジュール。
//!
//! ISO 32000-1 §7.3 の PDF オブジェクトを 1 つの enum で表す。本 Issue では
//! スカラ系 4 バリアント（Null / Boolean / Integer / Real）のみを定義し、
//! 文字列・名前・配列・辞書・参照・ストリームは後続 Issue で追加する。
//! 構築は無検証（infallible）で、妥当性検証は上位（lexer/parser）に委譲する。

/// PDF 基本オブジェクト（スカラ系 4 バリアントの起点）。
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
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn null_constructs_and_matches_null_arm() {
        // Null を構築し match で Null 腕に入ることを確認する
        let obj = PdfObject::Null;
        assert!(matches!(obj, PdfObject::Null));
    }

    #[test]
    fn boolean_constructs_and_matches_with_inner_value() {
        // Boolean(true) を構築し match の Boolean(b) 腕で b == true になることを確認する
        let obj = PdfObject::Boolean(true);
        match obj {
            PdfObject::Boolean(b) => assert!(b),
            _ => panic!("Boolean 腕に入らなかった"),
        }
    }

    #[test]
    fn integer_constructs_and_matches_with_inner_value() {
        // Integer(42) を構築し match の Integer(n) 腕で n == 42 になることを確認する
        let obj = PdfObject::Integer(42);
        match obj {
            PdfObject::Integer(n) => assert_eq!(n, 42),
            _ => panic!("Integer 腕に入らなかった"),
        }
    }

    #[test]
    fn real_constructs_and_matches_with_inner_value() {
        // Real(1.5) を構築し match の Real(r) 腕で r == 1.5 になることを確認する
        let obj = PdfObject::Real(1.5);
        match obj {
            PdfObject::Real(r) => assert_eq!(r, 1.5),
            _ => panic!("Real 腕に入らなかった"),
        }
    }

    #[test]
    fn is_null_returns_true_for_null() {
        // Null に is_null() を呼ぶと true を返すことを確認する
        assert!(PdfObject::Null.is_null());
    }

    #[test]
    fn as_bool_returns_some_for_boolean() {
        // Boolean(true) に as_bool() を呼ぶと Some(true) を返すことを確認する
        assert_eq!(PdfObject::Boolean(true).as_bool(), Some(true));
    }

    #[test]
    fn as_integer_returns_some_for_integer() {
        // Integer(7) に as_integer() を呼ぶと Some(7) を返すことを確認する
        assert_eq!(PdfObject::Integer(7).as_integer(), Some(7));
    }

    #[test]
    fn as_real_returns_some_for_real() {
        // Real(2.5) に as_real() を呼ぶと Some(2.5) を返すことを確認する
        assert_eq!(PdfObject::Real(2.5).as_real(), Some(2.5));
    }

    #[test]
    fn is_null_returns_false_for_non_null_variants() {
        // Null 以外（Boolean/Integer/Real）では is_null() が false を返すことを確認する
        for obj in &[
            PdfObject::Boolean(true),
            PdfObject::Integer(0),
            PdfObject::Real(0.0),
        ] {
            assert!(!obj.is_null());
        }
    }

    #[test]
    fn as_bool_returns_none_for_non_boolean_variants() {
        // Boolean 以外（Null/Integer/Real）では as_bool() が None を返すことを確認する
        for obj in &[PdfObject::Null, PdfObject::Integer(0), PdfObject::Real(0.0)] {
            assert_eq!(obj.as_bool(), None);
        }
    }

    #[test]
    fn as_integer_returns_none_for_non_integer_variants() {
        // Integer 以外（Null/Boolean/Real）では as_integer() が None を返すことを確認する
        for obj in &[
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Real(0.0),
        ] {
            assert_eq!(obj.as_integer(), None);
        }
    }

    #[test]
    fn as_real_returns_none_for_non_real_variants() {
        // Real 以外（Null/Boolean/Integer）では as_real() が None を返すことを確認する
        for obj in &[
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Integer(0),
        ] {
            assert_eq!(obj.as_real(), None);
        }
    }

    #[test]
    fn same_variant_same_value_is_equal() {
        // 同一バリアント・同値は == で等価になることを確認する
        assert_eq!(PdfObject::Integer(1), PdfObject::Integer(1));
        assert_eq!(PdfObject::Boolean(false), PdfObject::Boolean(false));
        assert_eq!(PdfObject::Null, PdfObject::Null);
    }

    #[test]
    fn different_variants_are_not_equal() {
        // 異なるバリアント間は数値的同値でも != で非等価になることを確認する
        assert_ne!(PdfObject::Integer(1), PdfObject::Real(1.0));
        assert_ne!(PdfObject::Boolean(false), PdfObject::Null);
    }

    #[test]
    fn all_distinct_variants_are_mutually_not_equal() {
        // 4 バリアントを総当たりで比較し、同一インデックスのみ等価・他は非等価であることを確認する
        // （NaN は等価判定が崩れるため代表値には含めない）
        let variants = [
            PdfObject::Null,
            PdfObject::Boolean(false),
            PdfObject::Integer(0),
            PdfObject::Real(0.0),
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
    fn integer_preserves_i64_boundaries() {
        // Integer(i64::MIN) / Integer(i64::MAX) を as_integer() でそのまま取り出せることを確認する
        for n in [i64::MIN, i64::MAX] {
            assert_eq!(PdfObject::Integer(n).as_integer(), Some(n));
        }
    }

    #[test]
    fn positive_and_negative_zero_are_equal() {
        // Real(0.0) と Real(-0.0) は IEEE 754 準拠で == 等価になることを確認する
        assert_eq!(PdfObject::Real(0.0), PdfObject::Real(-0.0));
    }

    #[test]
    fn nan_is_not_equal_to_itself() {
        // Real(NaN) 同士は IEEE 754 準拠で != 非等価（NaN != NaN）になることを確認する
        assert_ne!(PdfObject::Real(f64::NAN), PdfObject::Real(f64::NAN));
    }

    #[test]
    fn real_preserves_infinities() {
        // Real(±INFINITY) を as_real() でそのまま取り出せること（doc の「Inf 可」を裏付け）を確認する
        for r in [f64::INFINITY, f64::NEG_INFINITY] {
            assert_eq!(PdfObject::Real(r).as_real(), Some(r));
        }
    }

    #[test]
    fn clone_preserves_value_and_keeps_original_usable() {
        // NaN 以外（Integer(7)）は Clone で複製でき、複製が元と == かつ元も使用可能なことを確認する
        let original = PdfObject::Integer(7);
        let cloned = original.clone();
        assert_eq!(cloned, original);
        assert_eq!(original.as_integer(), Some(7));
    }

    #[test]
    fn clone_preserves_nan_real() {
        // Real(NaN) の clone 保持は == では検証できないため as_real().is_some_and(is_nan) で確認する
        let original = PdfObject::Real(f64::NAN);
        let cloned = original.clone();
        assert!(cloned.as_real().is_some_and(f64::is_nan));
    }

    #[test]
    fn debug_format_contains_variant_name() {
        // Debug 出力が各バリアント名を含むことを確認する
        assert!(format!("{:?}", PdfObject::Null).contains("Null"));
        assert!(format!("{:?}", PdfObject::Boolean(true)).contains("Boolean"));
        assert!(format!("{:?}", PdfObject::Integer(0)).contains("Integer"));
        assert!(format!("{:?}", PdfObject::Real(0.0)).contains("Real"));
    }
}
