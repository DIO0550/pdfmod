//! PDF 基本オブジェクトの中核 `PdfObject` を定義するモジュール。
//!
//! ISO 32000-1 §7.3 の PDF オブジェクトを 1 つの enum で表す。現時点では
//! スカラ系 4 バリアント（Null / Boolean / Integer / Real）に加え、文字列
//! （復号後の生バイト列）・名前（`PdfName`）・配列（`Vec<PdfObject>` の自己再帰）・
//! 辞書（`PdfDictionary`）を定義する。参照・ストリームは後続 Issue で追加する。
//! 構築は無検証（infallible）で、テキスト解釈や妥当性検証・正規化は上位
//! （lexer/parser）に委譲する。

use crate::object::dictionary::PdfDictionary;
use crate::object::name::PdfName;

/// PDF 基本オブジェクト（スカラ系・文字列・名前・配列・辞書バリアントを表す enum）。
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
    pub fn as_string(&self) -> Option<&[u8]> {
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
    /// ヒープ保持のため参照返し（`as_string` の `as_slice()` と同方針）。
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

    #[test]
    fn string_constructs_and_matches_string_arm() {
        // String(b"abc") を構築し matches! で String 腕に入ることを確認する
        let obj = PdfObject::String(b"abc".to_vec());
        assert!(matches!(obj, PdfObject::String(_)));
    }

    #[test]
    fn as_string_returns_some_for_string() {
        // String(b"abc") に as_string() を呼ぶと Some(b"abc") を返すことを確認する
        assert_eq!(
            PdfObject::String(b"abc".to_vec()).as_string(),
            Some(b"abc".as_slice())
        );
    }

    #[test]
    fn name_constructs_and_matches_name_arm() {
        // Name(PdfName::from("Type")) を構築し matches! で Name 腕に入ることを確認する
        let obj = PdfObject::Name(PdfName::from("Type"));
        assert!(matches!(obj, PdfObject::Name(_)));
    }

    #[test]
    fn as_name_returns_some_for_name() {
        // Name(PdfName::from("Type")) に as_name() を呼ぶと Some(&PdfName::from("Type")) を返すことを確認する
        let name = PdfName::from("Type");
        assert_eq!(
            PdfObject::Name(PdfName::from("Type")).as_name(),
            Some(&name)
        );
    }

    #[test]
    fn as_string_returns_none_for_non_string_variants() {
        // String 以外（Null/Boolean/Integer/Real/Name）では as_string() が None を返すことを確認する
        let variants = [
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Integer(0),
            PdfObject::Real(0.0),
            PdfObject::Name(PdfName::from("Type")),
        ];
        for obj in &variants {
            assert_eq!(obj.as_string(), None);
        }
    }

    #[test]
    fn as_name_returns_none_for_non_name_variants() {
        // Name 以外（Null/Boolean/Integer/Real/String）では as_name() が None を返すことを確認する
        let variants = [
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Integer(0),
            PdfObject::Real(0.0),
            PdfObject::String(b"abc".to_vec()),
        ];
        for obj in &variants {
            assert_eq!(obj.as_name(), None);
        }
    }

    #[test]
    fn as_string_returns_empty_slice_for_empty_string() {
        // 空バイト列の String(b"") は as_string() で Some(空スライス) を返すことを確認する
        assert_eq!(
            PdfObject::String(b"".to_vec()).as_string(),
            Some(b"".as_slice())
        );
    }

    #[test]
    fn as_string_preserves_nul_non_utf8_and_high_bytes() {
        // String(vec![0x00, 0x80, 0xFF]) を as_string() で取り出すと同一バイト列がテキスト解釈されず忠実に返ることを確認する
        let obj = PdfObject::String(vec![0x00, 0x80, 0xFF]);
        assert_eq!(obj.as_string(), Some([0x00, 0x80, 0xFF].as_slice()));
    }

    #[test]
    fn same_content_strings_are_equal() {
        // 同内容の String 同士は == で等価になることを確認する
        assert_eq!(
            PdfObject::String(b"x".to_vec()),
            PdfObject::String(b"x".to_vec())
        );
    }

    #[test]
    fn different_content_strings_are_not_equal() {
        // 異内容の String 同士は != で非等価になることを確認する
        assert_ne!(
            PdfObject::String(b"x".to_vec()),
            PdfObject::String(b"y".to_vec())
        );
    }

    #[test]
    fn same_content_names_are_equal() {
        // 同内容の Name 同士は == で等価になることを確認する
        assert_eq!(
            PdfObject::Name(PdfName::from("A")),
            PdfObject::Name(PdfName::from("A"))
        );
    }

    #[test]
    fn string_and_name_with_same_bytes_are_not_equal() {
        // 同一バイト内容でも String と Name は異バリアントのため != で非等価になることを確認する
        assert_ne!(
            PdfObject::String(b"Type".to_vec()),
            PdfObject::Name(PdfName::from("Type"))
        );
    }

    #[test]
    fn as_name_then_as_bytes_roundtrips() {
        // Name の as_name().unwrap().as_bytes() が元の名前バイト列 b"Type" を返す（後段借用経路）ことを確認する
        let obj = PdfObject::Name(PdfName::from("Type"));
        assert_eq!(obj.as_name().unwrap().as_bytes(), b"Type");
    }

    #[test]
    fn clone_preserves_string_and_name_and_keeps_original_usable() {
        // String/Name を clone() すると複製の中身が元と一致し、元も引き続き使用可能なことを確認する
        let original_string = PdfObject::String(b"abc".to_vec());
        let cloned_string = original_string.clone();
        assert_eq!(cloned_string.as_string(), Some(b"abc".as_slice()));
        assert_eq!(original_string.as_string(), Some(b"abc".as_slice()));

        let original_name = PdfObject::Name(PdfName::from("Type"));
        let cloned_name = original_name.clone();
        assert_eq!(cloned_name.as_name().unwrap().as_bytes(), b"Type");
        assert_eq!(original_name.as_name().unwrap().as_bytes(), b"Type");
    }

    #[test]
    fn as_string_preserves_long_multibyte_bytes() {
        // 長い+多バイトUTF-8（"名前"）混在のバイト列が as_string() で往復一致することを確認する（任意・優先度低）
        let mut bytes = "名前".as_bytes().to_vec();
        bytes.resize(bytes.len() + 300, b'a');
        let obj = PdfObject::String(bytes.clone());
        assert_eq!(obj.as_string(), Some(bytes.as_slice()));
    }

    #[test]
    fn strings_compare_on_trailing_byte() {
        // 複数バイト・末尾1バイト差で String の等価/非等価が判定されることを確認する（任意・優先度低）
        assert_eq!(
            PdfObject::String(b"abc".to_vec()),
            PdfObject::String(b"abc".to_vec())
        );
        assert_ne!(
            PdfObject::String(b"abc".to_vec()),
            PdfObject::String(b"abd".to_vec())
        );
    }

    #[test]
    fn debug_format_contains_string_and_name_variant_names() {
        // Debug 出力が String / Name のバリアント名を含むことを確認する（任意・優先度低）
        assert!(format!("{:?}", PdfObject::String(b"x".to_vec())).contains("String"));
        assert!(format!("{:?}", PdfObject::Name(PdfName::from("A"))).contains("Name"));
    }

    #[test]
    fn array_constructs_and_matches_array_arm() {
        // Array(vec![Integer(1)]) を構築し matches! で Array 腕に入ることを確認する
        let obj = PdfObject::Array(vec![PdfObject::Integer(1)]);
        assert!(matches!(obj, PdfObject::Array(_)));
    }

    #[test]
    fn dictionary_constructs_and_matches_dictionary_arm() {
        // Dictionary(PdfDictionary::new()) を構築し matches! で Dictionary 腕に入ることを確認する
        let obj = PdfObject::Dictionary(PdfDictionary::new());
        assert!(matches!(obj, PdfObject::Dictionary(_)));
    }

    #[test]
    fn as_array_returns_some_for_array() {
        // 要素入り Array に as_array() を呼ぶと Some(&[...]) を返し要素が一致することを確認する
        let obj = PdfObject::Array(vec![PdfObject::Integer(1), PdfObject::Boolean(true)]);
        assert_eq!(
            obj.as_array(),
            Some([PdfObject::Integer(1), PdfObject::Boolean(true)].as_slice())
        );
    }

    #[test]
    fn as_dictionary_returns_some_for_dictionary() {
        // 値入り Dictionary に as_dictionary() を呼ぶと Some(&PdfDictionary) を返し内容が一致することを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(42));
        let obj = PdfObject::Dictionary(dict.clone());
        assert_eq!(obj.as_dictionary(), Some(&dict));
    }

    #[test]
    fn as_array_then_index_roundtrips() {
        // as_array().unwrap()[i] で各要素にアクセスでき元の要素が返る（後段借用経路）ことを確認する
        let obj = PdfObject::Array(vec![PdfObject::Integer(10), PdfObject::Integer(20)]);
        let items = obj.as_array().unwrap();
        assert_eq!(items[0], PdfObject::Integer(10));
        assert_eq!(items[1], PdfObject::Integer(20));
    }

    #[test]
    fn as_dictionary_then_get_roundtrips() {
        // as_dictionary().unwrap().get(&key) で挿入した値が返る（後段借用経路）ことを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Key"), PdfObject::Integer(7));
        let obj = PdfObject::Dictionary(dict);
        assert_eq!(
            obj.as_dictionary().unwrap().get(&PdfName::from("Key")),
            Some(&PdfObject::Integer(7))
        );
    }

    #[test]
    fn as_array_returns_none_for_non_array_variants() {
        // Array 以外（Null/Boolean/Integer/Real/String/Name/Dictionary）では as_array() が None を返すことを確認する
        let variants = [
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Integer(0),
            PdfObject::Real(0.0),
            PdfObject::String(b"abc".to_vec()),
            PdfObject::Name(PdfName::from("Type")),
            PdfObject::Dictionary(PdfDictionary::new()),
        ];
        for obj in &variants {
            assert_eq!(obj.as_array(), None);
        }
    }

    #[test]
    fn as_dictionary_returns_none_for_non_dictionary_variants() {
        // Dictionary 以外（Null/Boolean/Integer/Real/String/Name/Array）では as_dictionary() が None を返すことを確認する
        let variants = [
            PdfObject::Null,
            PdfObject::Boolean(true),
            PdfObject::Integer(0),
            PdfObject::Real(0.0),
            PdfObject::String(b"abc".to_vec()),
            PdfObject::Name(PdfName::from("Type")),
            PdfObject::Array(vec![PdfObject::Integer(1)]),
        ];
        for obj in &variants {
            assert_eq!(obj.as_dictionary(), None);
        }
    }

    #[test]
    fn as_array_returns_empty_slice_for_empty_array() {
        // 空配列 Array(vec![]) は as_array() で Some(空スライス) を返すことを確認する
        let obj = PdfObject::Array(vec![]);
        let empty: &[PdfObject] = &[];
        assert_eq!(obj.as_array(), Some(empty));
    }

    #[test]
    fn as_dictionary_returns_empty_for_empty_dictionary() {
        // 空辞書 Dictionary(PdfDictionary::new()) は as_dictionary() で Some かつ is_empty() が真になることを確認する
        let obj = PdfObject::Dictionary(PdfDictionary::new());
        let dict = obj.as_dictionary();
        assert!(dict.is_some());
        assert!(dict.unwrap().is_empty());
    }

    #[test]
    fn same_content_arrays_are_equal() {
        // 同内容（有限値のみ）の Array 同士は == で等価になることを確認する
        assert_eq!(
            PdfObject::Array(vec![PdfObject::Integer(1), PdfObject::Boolean(true)]),
            PdfObject::Array(vec![PdfObject::Integer(1), PdfObject::Boolean(true)])
        );
    }

    #[test]
    fn same_content_dictionaries_are_equal() {
        // 同内容（有限値のみ）の Dictionary 同士は == で等価になることを確認する
        let mut a = PdfDictionary::new();
        a.insert(PdfName::from("A"), PdfObject::Integer(1));
        let mut b = PdfDictionary::new();
        b.insert(PdfName::from("A"), PdfObject::Integer(1));
        assert_eq!(PdfObject::Dictionary(a), PdfObject::Dictionary(b));
    }

    #[test]
    fn different_content_arrays_are_not_equal() {
        // 要素が異なる Array 同士・長さ違いの Array 同士は != で非等価になることを確認する
        assert_ne!(
            PdfObject::Array(vec![PdfObject::Integer(1)]),
            PdfObject::Array(vec![PdfObject::Integer(2)])
        );
        assert_ne!(
            PdfObject::Array(vec![PdfObject::Integer(1)]),
            PdfObject::Array(vec![PdfObject::Integer(1), PdfObject::Integer(1)])
        );
    }

    #[test]
    fn empty_array_and_empty_dictionary_are_not_equal() {
        // 空配列 Array(vec![]) と空辞書 Dictionary(PdfDictionary::new()) は異バリアントのため != になることを確認する
        assert_ne!(
            PdfObject::Array(vec![]),
            PdfObject::Dictionary(PdfDictionary::new())
        );
    }

    #[test]
    fn array_and_dictionary_are_not_equal() {
        // 非空 Array と非空 Dictionary は異バリアントのため != になることを確認する
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("A"), PdfObject::Integer(1));
        assert_ne!(
            PdfObject::Array(vec![PdfObject::Integer(1)]),
            PdfObject::Dictionary(dict)
        );
    }

    #[test]
    fn array_containing_nan_is_not_equal_to_itself_content() {
        // 要素に Real(NaN) を含む Array 同士は NaN != NaN が配列に伝播し != になることを確認する
        assert_ne!(
            PdfObject::Array(vec![PdfObject::Real(f64::NAN)]),
            PdfObject::Array(vec![PdfObject::Real(f64::NAN)])
        );
    }

    #[test]
    fn dictionary_containing_nan_value_is_not_equal_to_itself_content() {
        // 値に Real(NaN) を持つ Dictionary 同士は NaN が辞書に伝播し != になることを確認する
        let mut a = PdfDictionary::new();
        a.insert(PdfName::from("N"), PdfObject::Real(f64::NAN));
        let mut b = PdfDictionary::new();
        b.insert(PdfName::from("N"), PdfObject::Real(f64::NAN));
        assert_ne!(PdfObject::Dictionary(a), PdfObject::Dictionary(b));
    }

    #[test]
    fn array_can_nest_dictionary_and_array() {
        // 配列内に辞書・配列を入れた多段 Array を構築し as_array で取り出すとネスト構造が忠実に保持され同内容なら == になることを確認する
        let mut inner_dict = PdfDictionary::new();
        inner_dict.insert(PdfName::from("K"), PdfObject::Integer(1));
        let nested = PdfObject::Array(vec![
            PdfObject::Dictionary(inner_dict.clone()),
            PdfObject::Array(vec![PdfObject::Integer(2)]),
        ]);
        let items = nested.as_array().unwrap();
        assert_eq!(items[0], PdfObject::Dictionary(inner_dict));
        assert_eq!(items[1], PdfObject::Array(vec![PdfObject::Integer(2)]));

        let mut inner_dict2 = PdfDictionary::new();
        inner_dict2.insert(PdfName::from("K"), PdfObject::Integer(1));
        let nested2 = PdfObject::Array(vec![
            PdfObject::Dictionary(inner_dict2),
            PdfObject::Array(vec![PdfObject::Integer(2)]),
        ]);
        assert_eq!(nested, nested2);
    }

    #[test]
    fn dictionary_value_can_be_array_and_dictionary() {
        // 辞書値に配列・辞書を入れた多段 Dictionary を構築し as_dictionary().get() で取り出すとネスト構造が忠実に保持され、同内容なら == になることを確認する
        let mut inner = PdfDictionary::new();
        inner.insert(PdfName::from("Inner"), PdfObject::Integer(9));
        let mut outer = PdfDictionary::new();
        outer.insert(
            PdfName::from("Arr"),
            PdfObject::Array(vec![PdfObject::Integer(1)]),
        );
        outer.insert(PdfName::from("Dict"), PdfObject::Dictionary(inner.clone()));
        let obj = PdfObject::Dictionary(outer);
        let d = obj.as_dictionary().unwrap();
        assert_eq!(
            d.get(&PdfName::from("Arr")),
            Some(&PdfObject::Array(vec![PdfObject::Integer(1)]))
        );
        assert_eq!(
            d.get(&PdfName::from("Dict")),
            Some(&PdfObject::Dictionary(inner))
        );

        // 配列版（array_can_nest_dictionary_and_array）と対称に、辞書全体の == 比較でも同内容なら等価になることを確認する
        let mut inner2 = PdfDictionary::new();
        inner2.insert(PdfName::from("Inner"), PdfObject::Integer(9));
        let mut outer2 = PdfDictionary::new();
        outer2.insert(
            PdfName::from("Arr"),
            PdfObject::Array(vec![PdfObject::Integer(1)]),
        );
        outer2.insert(PdfName::from("Dict"), PdfObject::Dictionary(inner2));
        assert_eq!(obj, PdfObject::Dictionary(outer2));
    }

    #[test]
    fn clone_preserves_array_and_dictionary_and_keeps_original_usable() {
        // 有限値のみの Array/Dictionary を clone() すると複製が元と == かつ元も引き続き使用可能なことを確認する
        let original_array =
            PdfObject::Array(vec![PdfObject::Integer(1), PdfObject::Boolean(true)]);
        let cloned_array = original_array.clone();
        assert_eq!(cloned_array, original_array);
        assert_eq!(original_array.as_array().unwrap().len(), 2);

        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Type"), PdfObject::Integer(42));
        let original_dict = PdfObject::Dictionary(dict);
        let cloned_dict = original_dict.clone();
        assert_eq!(cloned_dict, original_dict);
        assert_eq!(
            original_dict
                .as_dictionary()
                .unwrap()
                .get(&PdfName::from("Type")),
            Some(&PdfObject::Integer(42))
        );
    }

    #[test]
    fn debug_format_contains_array_and_dictionary_variant_names() {
        // Debug 出力が Array / Dictionary のバリアント名を含むことを確認する
        assert!(format!("{:?}", PdfObject::Array(vec![PdfObject::Integer(1)])).contains("Array"));
        assert!(format!("{:?}", PdfObject::Dictionary(PdfDictionary::new())).contains("Dictionary"));
    }
}
