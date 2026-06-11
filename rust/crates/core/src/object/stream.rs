//! PDF のストリームオブジェクト（stream）を表す `PdfStream` を定義するモジュール。
//!
//! 辞書部 `PdfDictionary`（#264）と生バイト列 `Vec<u8>` の組。生成は無検証
//! （infallible）で、空辞書・空バイト列・NUL/非UTF-8 を含む任意のバイト列を
//! 無条件に受理する。`/Length` と実データ長の整合性検証やフィルタ
//! （`/FlateDecode` 等）による復号は上位（lexer/parser 層・後続フェーズ）に委譲する。
//!
//! 本モジュールは Issue #267（Phase R0）で追加された PDF オブジェクト層の基盤型。

use crate::object::dictionary::PdfDictionary;

/// PDF ストリームオブジェクト。辞書部と生バイト列（**復号前**）を内包する。
///
/// `PdfDictionary`（`Real(f64)` の `NaN != NaN` により `Eq` 非実装）を内包する
/// ため `Eq`/`Hash`/`Ord` は derive できない。ヒープ保持（`BTreeMap` + `Vec<u8>`）
/// のため `Copy` も不可。「空辞書 + 空データ」をデフォルト値として量産する意味が
/// 薄いため `Default` も付けない（複合 struct の前例 `ObjectId`/`IndirectRef` と
/// 同方針）。よって derive は `Debug, Clone, PartialEq` のみ。
#[derive(Debug, Clone, PartialEq)]
pub struct PdfStream {
    dictionary: PdfDictionary,
    data: Vec<u8>,
}

impl PdfStream {
    /// 辞書部と生バイト列から `PdfStream` を生成する。
    ///
    /// 無検証（infallible）。空辞書・空バイト列・NUL/非UTF-8/高位バイトを含む
    /// 任意のバイト列を無条件に受理する。`/Length` 整合性検証やフィルタ復号は
    /// 上位（lexer/parser 層）に委譲する。`data` は `impl Into<Vec<u8>>` 受け
    /// （`PdfName::new` と同方針。`b"..."` を直接渡せる）。`Vec<u8>` 入力はムーブ格納で
    /// コピーなし、スライス・配列参照入力は所有化のためのコピーが 1 回発生する。
    pub fn new(dictionary: PdfDictionary, data: impl Into<Vec<u8>>) -> PdfStream {
        PdfStream {
            dictionary,
            data: data.into(),
        }
    }

    /// 辞書部への参照を取り出す。
    ///
    /// ヒープ保持のため参照返し（`PdfObject::as_dictionary` と同方針）。
    pub fn dictionary(&self) -> &PdfDictionary {
        &self.dictionary
    }

    /// 生バイト列（復号前）への参照を取り出す。
    ///
    /// ヒープ保持のため参照返し（`PdfName::as_bytes` と同方針）。
    pub fn data(&self) -> &[u8] {
        &self.data
    }

    /// `self` を消費して辞書部と生バイト列を所有権ごと分解する。
    ///
    /// 後続の復号フェーズで `Vec<u8>` をムーブで取り出してフィルタ復号の入力に
    /// する用途を想定（格納済み `Vec<u8>` のムーブ返しで追加コピーなし）。
    /// 参照取得で足りる場合は `dictionary()` /
    /// `data()` を使う。本クレート初の所有権分解 API。
    pub fn into_parts(self) -> (PdfDictionary, Vec<u8>) {
        (self.dictionary, self.data)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::object::name::PdfName;
    use crate::object::pdf_object::PdfObject;

    /// 値入り辞書 + `b"stream data"` で構築し `dictionary()` / `data()` で入力と同内容が返る（ラウンドトリップ・無損失）。
    #[test]
    fn new_then_accessors_roundtrip() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Length"), PdfObject::Integer(11));
        let stream = PdfStream::new(dict.clone(), b"stream data");
        assert_eq!(stream.dictionary(), &dict);
        assert_eq!(stream.data(), b"stream data");
    }

    /// `b"..."`（`&[u8; N]`）・`Vec<u8>`・`&[u8]` の 3 形いずれも受理され `data()` が同一バイト列を返す（`impl Into<Vec<u8>>` の動作確認）。
    #[test]
    fn new_accepts_into_vec_u8_variants() {
        let from_array_ref = PdfStream::new(PdfDictionary::new(), b"abc");
        let from_vec = PdfStream::new(PdfDictionary::new(), b"abc".to_vec());
        let from_slice = PdfStream::new(PdfDictionary::new(), b"abc".as_slice());
        assert_eq!(from_array_ref.data(), b"abc");
        assert_eq!(from_vec.data(), b"abc");
        assert_eq!(from_slice.data(), b"abc");
    }

    /// `/Length` キーを入れた辞書で構築し `dictionary().get(&key)` で挿入した値に到達できる（後段借用経路）。
    #[test]
    fn dictionary_accessor_reaches_entries() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Length"), PdfObject::Integer(3));
        let stream = PdfStream::new(dict, b"xyz");
        assert_eq!(
            stream.dictionary().get(&PdfName::from("Length")),
            Some(&PdfObject::Integer(3))
        );
    }

    /// 空バイト列 `b""` を無検証で受理し `data()` が空スライスを返す。
    #[test]
    fn accepts_empty_data() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Length"), PdfObject::Integer(0));
        let stream = PdfStream::new(dict, b"");
        assert_eq!(stream.data(), b"");
    }

    /// 空辞書 `PdfDictionary::new()` を無検証で受理し `dictionary().is_empty()` が真になる。
    #[test]
    fn accepts_empty_dictionary() {
        let stream = PdfStream::new(PdfDictionary::new(), b"data");
        assert!(stream.dictionary().is_empty());
        assert_eq!(stream.data(), b"data");
    }

    /// 空辞書 + 空バイト列の両方空でも無検証で受理され両アクセサが空を返す。
    #[test]
    fn accepts_empty_dictionary_and_empty_data() {
        let stream = PdfStream::new(PdfDictionary::new(), b"");
        assert!(stream.dictionary().is_empty());
        assert_eq!(stream.data(), b"");
    }

    /// `vec![0x00, 0x80, 0xFF]`（NUL/非UTF-8/高位バイト）がテキスト解釈されず生バイトのまま忠実に保持される（無検証保持）。
    #[test]
    fn data_preserves_nul_non_utf8_and_high_bytes() {
        let stream = PdfStream::new(PdfDictionary::new(), vec![0x00, 0x80, 0xFF]);
        assert_eq!(stream.data(), [0x00, 0x80, 0xFF].as_slice());
    }

    /// `into_parts()` で `(PdfDictionary, Vec<u8>)` に分解でき、分解結果が構築時の入力と同内容になる（所有権ムーブ）。
    #[test]
    fn into_parts_decomposes_ownership() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Length"), PdfObject::Integer(4));
        let stream = PdfStream::new(dict.clone(), b"body");
        let (decomposed_dict, decomposed_data) = stream.into_parts();
        assert_eq!(decomposed_dict, dict);
        assert_eq!(decomposed_data, b"body".to_vec());
    }

    /// 空辞書 + 空データのストリームを `into_parts()` すると空辞書と空 `Vec` が返る。
    #[test]
    fn into_parts_on_empty_stream() {
        let stream = PdfStream::new(PdfDictionary::new(), b"");
        let (decomposed_dict, decomposed_data) = stream.into_parts();
        assert!(decomposed_dict.is_empty());
        assert!(decomposed_data.is_empty());
    }

    /// `clone()` の複製が元と `==` 等価かつ元も引き続き使用可能（深いコピー・独立性）。
    #[test]
    fn clone_preserves_content_and_keeps_original_usable() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Length"), PdfObject::Integer(4));
        let original = PdfStream::new(dict, b"body");
        let cloned = original.clone();
        assert_eq!(cloned, original);
        assert_eq!(original.data(), b"body");
    }

    /// 同内容（同辞書 + 同データ）の 2 値は `==` で等価（`PartialEq` が両フィールドに委譲）。
    #[test]
    fn same_content_streams_are_equal() {
        let mut dict_a = PdfDictionary::new();
        dict_a.insert(PdfName::from("Length"), PdfObject::Integer(4));
        let mut dict_b = PdfDictionary::new();
        dict_b.insert(PdfName::from("Length"), PdfObject::Integer(4));
        assert_eq!(
            PdfStream::new(dict_a, b"body"),
            PdfStream::new(dict_b, b"body")
        );
    }

    /// dictionary は同一で data のみ異なる 2 値は `!=` 非等価（data 軸の差異が反映される）。
    #[test]
    fn not_equal_when_data_differs() {
        assert_ne!(
            PdfStream::new(PdfDictionary::new(), b"abc"),
            PdfStream::new(PdfDictionary::new(), b"abd")
        );
    }

    /// data は同一で dictionary のみ異なる 2 値は `!=` 非等価（dictionary 軸の差異が反映される）。
    #[test]
    fn not_equal_when_dictionary_differs() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::from("Length"), PdfObject::Integer(3));
        assert_ne!(
            PdfStream::new(dict, b"abc"),
            PdfStream::new(PdfDictionary::new(), b"abc")
        );
    }

    /// 辞書値に `Real(NaN)` を含む同内容ストリーム同士は `!=` 非等価（`NaN != NaN` の再帰伝播。`Eq` 非実装の根拠）。
    #[test]
    fn nan_in_dictionary_propagates_to_inequality() {
        let mut dict_a = PdfDictionary::new();
        dict_a.insert(PdfName::from("N"), PdfObject::Real(f64::NAN));
        let mut dict_b = PdfDictionary::new();
        dict_b.insert(PdfName::from("N"), PdfObject::Real(f64::NAN));
        assert_ne!(
            PdfStream::new(dict_a, b"data"),
            PdfStream::new(dict_b, b"data")
        );
    }

    /// `Debug` 出力に型名 `PdfStream` を含む。
    #[test]
    fn debug_format_contains_type_name() {
        let stream = PdfStream::new(PdfDictionary::new(), b"data");
        assert!(format!("{:?}", stream).contains("PdfStream"));
    }
}
