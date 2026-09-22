use super::super::*;
use super::{make_ref, make_stream};
use crate::object::array::PdfArray;

#[test]
fn array_constructs_and_matches_array_arm() {
    // Array(PdfArray::from(vec![Integer(1)])) を構築し matches! で Array 腕に入ることを確認する
    let obj = PdfObject::Array(PdfArray::from(vec![PdfObject::from(1)]));
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
    // 要素入り Array に as_array() を呼ぶと Some(&[...]) を返し、as_pdf_array() で Some(&PdfArray) を返すことを確認する
    let obj = PdfObject::from(vec![PdfObject::from(1), PdfObject::from(true)]);
    assert_eq!(
        obj.as_array(),
        Some([PdfObject::from(1), PdfObject::from(true)].as_slice())
    );
    assert_eq!(
        obj.as_pdf_array(),
        Some(&PdfArray::from(vec![
            PdfObject::from(1),
            PdfObject::from(true)
        ]))
    );
}

#[test]
fn as_dictionary_returns_some_for_dictionary() {
    // 値入り Dictionary に as_dictionary() を呼ぶと Some(&PdfDictionary) を返し内容が一致することを確認する
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("Type"), PdfObject::from(42));
    let obj = PdfObject::Dictionary(dict.clone());
    assert_eq!(obj.as_dictionary(), Some(&dict));
}

#[test]
fn as_array_then_index_roundtrips() {
    // as_array().unwrap()[i] で各要素にアクセスでき元の要素が返る（後段借用経路）ことを確認する
    let obj = PdfObject::from(vec![PdfObject::from(10), PdfObject::from(20)]);
    let items = obj.as_array().unwrap();
    assert_eq!(items[0], PdfObject::from(10));
    assert_eq!(items[1], PdfObject::from(20));
}

#[test]
fn as_dictionary_then_get_roundtrips() {
    // as_dictionary().unwrap().get(&key) で挿入した値が返る（後段借用経路）ことを確認する
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("Key"), PdfObject::from(7));
    let obj = PdfObject::Dictionary(dict);
    assert_eq!(
        obj.as_dictionary().unwrap().get(&PdfName::from("Key")),
        Some(&PdfObject::from(7))
    );
}

#[test]
fn as_array_returns_none_for_non_array_variants() {
    // Array 以外（Null/Boolean/Integer/Real/String/Name/Dictionary/Stream/Reference）では as_array() / as_pdf_array() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::from(true),
        PdfObject::from(0),
        PdfObject::from(0.0),
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::Dictionary(PdfDictionary::new()),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for obj in &variants {
        assert_eq!(obj.as_array(), None);
        assert_eq!(obj.as_pdf_array(), None);
    }
}

#[test]
fn as_dictionary_returns_none_for_non_dictionary_variants() {
    // Dictionary 以外（Null/Boolean/Integer/Real/String/Name/Array/Stream/Reference）では as_dictionary() が None を返すことを確認する
    let variants = [
        PdfObject::Null,
        PdfObject::from(true),
        PdfObject::from(0),
        PdfObject::from(0.0),
        PdfObject::String(PdfString::literal(b"abc")),
        PdfObject::Name(PdfName::from("Type")),
        PdfObject::from(vec![PdfObject::from(1)]),
        PdfObject::Stream(make_stream(b"data")),
        PdfObject::Reference(make_ref(1, 0)),
    ];
    for obj in &variants {
        assert_eq!(obj.as_dictionary(), None);
    }
}

#[test]
fn as_array_returns_empty_slice_for_empty_array() {
    // 空配列 Array(PdfArray::new()) は as_array() で Some(空スライス) を返すことを確認する
    let obj = PdfObject::Array(PdfArray::new());
    let empty: &[PdfObject] = &[];
    assert_eq!(obj.as_array(), Some(empty));
    assert_eq!(obj.as_pdf_array(), Some(&PdfArray::new()));
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
        PdfObject::from(vec![PdfObject::from(1), PdfObject::from(true)]),
        PdfObject::from(vec![PdfObject::from(1), PdfObject::from(true)])
    );
}

#[test]
fn same_content_dictionaries_are_equal() {
    // 同内容（有限値のみ）の Dictionary 同士は == で等価になることを確認する
    let mut a = PdfDictionary::new();
    a.insert(PdfName::from("A"), PdfObject::from(1));
    let mut b = PdfDictionary::new();
    b.insert(PdfName::from("A"), PdfObject::from(1));
    assert_eq!(PdfObject::Dictionary(a), PdfObject::Dictionary(b));
}

#[test]
fn different_content_arrays_are_not_equal() {
    // 要素が異なる Array 同士・長さ違いの Array 同士は != で非等価になることを確認する
    assert_ne!(
        PdfObject::from(vec![PdfObject::from(1)]),
        PdfObject::from(vec![PdfObject::from(2)])
    );
    assert_ne!(
        PdfObject::from(vec![PdfObject::from(1)]),
        PdfObject::from(vec![PdfObject::from(1), PdfObject::from(1)])
    );
}

#[test]
fn empty_array_and_empty_dictionary_are_not_equal() {
    // 空配列 Array(PdfArray::new()) と空辞書 Dictionary(PdfDictionary::new()) は異バリアントのため != になることを確認する
    assert_ne!(
        PdfObject::Array(PdfArray::new()),
        PdfObject::Dictionary(PdfDictionary::new())
    );
}

#[test]
fn array_and_dictionary_are_not_equal() {
    // 非空 Array と非空 Dictionary は異バリアントのため != になることを確認する
    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("A"), PdfObject::from(1));
    assert_ne!(
        PdfObject::from(vec![PdfObject::from(1)]),
        PdfObject::Dictionary(dict)
    );
}

#[test]
fn array_containing_nan_is_not_equal_to_itself_content() {
    // 要素に Real(NaN) を含む Array 同士は NaN != NaN が配列に伝播し != になることを確認する
    assert_ne!(
        PdfObject::from(vec![PdfObject::from(f64::NAN)]),
        PdfObject::from(vec![PdfObject::from(f64::NAN)])
    );
}

#[test]
fn dictionary_containing_nan_value_is_not_equal_to_itself_content() {
    // 値に Real(NaN) を持つ Dictionary 同士は NaN が辞書に伝播し != になることを確認する
    let mut a = PdfDictionary::new();
    a.insert(PdfName::from("N"), PdfObject::from(f64::NAN));
    let mut b = PdfDictionary::new();
    b.insert(PdfName::from("N"), PdfObject::from(f64::NAN));
    assert_ne!(PdfObject::Dictionary(a), PdfObject::Dictionary(b));
}

#[test]
fn array_can_nest_dictionary_and_array() {
    // 配列内に辞書・配列を入れた多段 Array を構築し as_array で取り出すとネスト構造が忠実に保持され同内容なら == になることを確認する
    let mut inner_dict = PdfDictionary::new();
    inner_dict.insert(PdfName::from("K"), PdfObject::from(1));
    let nested = PdfObject::from(vec![
        PdfObject::Dictionary(inner_dict.clone()),
        PdfObject::from(vec![PdfObject::from(2)]),
    ]);
    let items = nested.as_array().unwrap();
    assert_eq!(items[0], PdfObject::Dictionary(inner_dict));
    assert_eq!(items[1], PdfObject::from(vec![PdfObject::from(2)]));

    let mut inner_dict2 = PdfDictionary::new();
    inner_dict2.insert(PdfName::from("K"), PdfObject::from(1));
    let nested2 = PdfObject::from(vec![
        PdfObject::Dictionary(inner_dict2),
        PdfObject::from(vec![PdfObject::from(2)]),
    ]);
    assert_eq!(nested, nested2);
}

#[test]
fn dictionary_value_can_be_array_and_dictionary() {
    // 辞書値に配列・辞書を入れた多段 Dictionary を構築し as_dictionary().get() で取り出すとネスト構造が忠実に保持され、同内容なら == になることを確認する
    let mut inner = PdfDictionary::new();
    inner.insert(PdfName::from("Inner"), PdfObject::from(9));
    let mut outer = PdfDictionary::new();
    outer.insert(
        PdfName::from("Arr"),
        PdfObject::from(vec![PdfObject::from(1)]),
    );
    outer.insert(PdfName::from("Dict"), PdfObject::Dictionary(inner.clone()));
    let obj = PdfObject::Dictionary(outer);
    let d = obj.as_dictionary().unwrap();
    assert_eq!(
        d.get(&PdfName::from("Arr")),
        Some(&PdfObject::from(vec![PdfObject::from(1)]))
    );
    assert_eq!(
        d.get(&PdfName::from("Dict")),
        Some(&PdfObject::Dictionary(inner))
    );

    // 配列版（array_can_nest_dictionary_and_array）と対称に、辞書全体の == 比較でも同内容なら等価になることを確認する
    let mut inner2 = PdfDictionary::new();
    inner2.insert(PdfName::from("Inner"), PdfObject::from(9));
    let mut outer2 = PdfDictionary::new();
    outer2.insert(
        PdfName::from("Arr"),
        PdfObject::from(vec![PdfObject::from(1)]),
    );
    outer2.insert(PdfName::from("Dict"), PdfObject::Dictionary(inner2));
    assert_eq!(obj, PdfObject::Dictionary(outer2));
}

#[test]
fn clone_preserves_array_and_dictionary_and_keeps_original_usable() {
    // 有限値のみの Array/Dictionary を clone() すると複製が元と == かつ元も引き続き使用可能なことを確認する
    let original_array = PdfObject::from(vec![PdfObject::from(1), PdfObject::from(true)]);
    let cloned_array = original_array.clone();
    assert_eq!(cloned_array, original_array);
    assert_eq!(original_array.as_array().unwrap().len(), 2);

    let mut dict = PdfDictionary::new();
    dict.insert(PdfName::from("Type"), PdfObject::from(42));
    let original_dict = PdfObject::Dictionary(dict);
    let cloned_dict = original_dict.clone();
    assert_eq!(cloned_dict, original_dict);
    assert_eq!(
        original_dict
            .as_dictionary()
            .unwrap()
            .get(&PdfName::from("Type")),
        Some(&PdfObject::from(42))
    );
}

#[test]
fn debug_format_contains_array_and_dictionary_variant_names() {
    // Debug 出力が Array / Dictionary のバリアント名を含むことを確認する
    assert!(format!("{:?}", PdfObject::from(vec![PdfObject::from(1)])).contains("Array"));
    assert!(format!("{:?}", PdfObject::Dictionary(PdfDictionary::new())).contains("Dictionary"));
}
