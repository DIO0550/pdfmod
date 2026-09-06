//! フリーリストのリンク値 `FreeObjectNumber` を定義するモジュール。
//!
//! ISO 32000-1 §7.5.4 のフリーオブジェクト連結リストで、xref エントリが指す
//! 「次の空きオブジェクト番号」を表す newtype。リスト末尾では 0（先頭へ戻る）を
//! 指すことが仕様上正しいため、0 を正規値として受理する。
//!
//! # `ObjectNumber` と分ける理由
//!
//! 間接オブジェクトの識別子（§7.3.10）は正整数で、[`ObjectNumber`] は #334 以降
//! `NonZeroU64` により 0 を表現できない。一方フリーリストのリンク値は 0 が正規値で、
//! 両者を同じ型にすると「0 を許すか」の不変条件が型の中で矛盾する。値の意味が
//! 違うものを別の型で表し、取り違えをコンパイル時に落とす。
//!
//! [`ObjectNumber`] が検証付き構築のみを持つのに対し、本型の定義域は `u64` 全域と
//! 一致し検証すべきものが無いため、生成は無検証（infallible）とし `From<u64>` を
//! 健全に保つ（`ByteOffset` と同じ扱い）。
//!
//! 「0 = リスト終端」を表す定数は設けない。現時点でフリーリストを走査する実装が無く、
//! 走査の実装時に必要な語彙が決まるまで命名を先取りしないためである。
//!
//! [`ObjectNumber`]: crate::object::object_number::ObjectNumber

use std::fmt;

/// フリーリスト上で次に来る空きオブジェクト番号（ISO 32000-1 §7.5.4）。
///
/// 内部表現は `u64`（`ObjectNumber` と同じ幅）。値ラッパであり `Copy`。
/// 等価・順序・ハッシュは内部 `u64` の自然な振る舞いに従う。
///
/// `ObjectNumber` とは別の型であり、相互に代入できない（#334）。
///
/// まず、両方の型が公開パスから構築できることを確認する（下の `compile_fail` が
/// 型不一致ではなくパス解決の失敗で通ってしまう事故を防ぐための土台）:
///
/// ```
/// use pdfmod_core::object::{free_object_number::FreeObjectNumber, object_number::ObjectNumber};
/// let n = ObjectNumber::new(1).expect("positive");
/// let f = FreeObjectNumber::new(0);
/// assert_eq!(n.value(), 1);
/// assert_eq!(f.value(), 0);
/// ```
///
/// そのうえで、以下の 2 つはどちらもコンパイルエラーになる:
///
/// ```compile_fail,E0308
/// use pdfmod_core::object::{free_object_number::FreeObjectNumber, object_number::ObjectNumber};
/// let n = ObjectNumber::new(1).expect("positive");
/// let _f: FreeObjectNumber = n;
/// ```
///
/// ```compile_fail,E0308
/// use pdfmod_core::object::{free_object_number::FreeObjectNumber, object_number::ObjectNumber};
/// let f = FreeObjectNumber::new(0);
/// let _n: ObjectNumber = f;
/// ```
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct FreeObjectNumber(u64);

impl FreeObjectNumber {
    /// 与えられた `u64` からリンク値を生成する。
    ///
    /// 無検証（infallible）。0（リスト末尾）や `u64::MAX` を含む任意の値を受理する。
    pub fn new(n: u64) -> Self {
        Self(n)
    }

    /// 内部の値を `u64` として取り出す。
    #[must_use]
    pub fn value(&self) -> u64 {
        self.0
    }
}

impl From<u64> for FreeObjectNumber {
    /// `u64` からリンク値を生成する慣習的な変換経路。
    ///
    /// 定義域が完全に一致するロスレスな全域変換であり panic する経路を持たないため、
    /// `TryFrom` ではなく `From` を採用する。
    fn from(n: u64) -> Self {
        Self(n)
    }
}

impl From<FreeObjectNumber> for u64 {
    /// リンク値から内部の `u64` を取り出す逆方向の変換経路。
    ///
    /// ロスレスな変換は双方向に `From` を提供するのが Rust API Guidelines (C-CONV) の
    /// 推奨であるため、入力方向とあわせて実装する。既存の `value()` と結果は等価。
    fn from(number: FreeObjectNumber) -> Self {
        number.0
    }
}

/// 内部の値を装飾なしで出力する（型名などを付け足さない）。
///
/// 実装は内部 `u64` の `Display` へ委譲するため、呼び出し側が指定した幅・ゼロ埋めが
/// そのまま働く（`{:06}` は `"000042"`）。`Debug` は derive のまま。
impl fmt::Display for FreeObjectNumber {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_new_then_value_roundtrips() {
        // リスト末尾を表す 0 を含む代表値が保持されることを確認する
        for n in [0, 1, 42, u64::MAX] {
            assert_eq!(
                FreeObjectNumber::new(n).value(),
                n,
                "FreeObjectNumber::new({n}) should keep its value"
            );
        }
    }

    #[test]
    fn test_from_u64_matches_new() {
        assert_eq!(FreeObjectNumber::from(0), FreeObjectNumber::new(0));
        assert_eq!(FreeObjectNumber::from(42), FreeObjectNumber::new(42));
    }

    #[test]
    fn test_from_then_into_roundtrips() {
        // u64 -> FreeObjectNumber -> u64 の往復が無損失であることを確認する
        for n in [0, 1, 42, u64::MAX] {
            assert_eq!(
                u64::from(FreeObjectNumber::from(n)),
                n,
                "roundtrip of {n} should be lossless"
            );
        }
    }

    #[test]
    fn test_into_u64_matches_value() {
        let number = FreeObjectNumber::new(7);
        assert_eq!(u64::from(number), number.value());
    }

    #[test]
    fn test_display_renders_decimal() {
        assert_eq!(format!("{}", FreeObjectNumber::new(42)), "42");
    }

    #[test]
    fn test_display_renders_zero_as_zero() {
        // リスト末尾の 0 が空文字列にならないことを確認する
        assert_eq!(format!("{}", FreeObjectNumber::new(0)), "0");
    }

    #[test]
    fn test_display_respects_width_and_zero_pad() {
        // 呼び出し側の書式指定が握り潰されず内部 u64 の Display へ渡ることを確認する
        assert_eq!(format!("{:06}", FreeObjectNumber::new(42)), "000042");
    }

    #[test]
    fn test_display_omits_type_name_decoration() {
        let number = FreeObjectNumber::new(42);
        assert_eq!(format!("{number}"), "42");
        assert_eq!(format!("{number:?}"), "FreeObjectNumber(42)");
    }
}
