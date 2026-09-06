//! PDF の間接オブジェクトを識別するオブジェクト番号 `ObjectNumber` を定義するモジュール。
//!
//! 裸の `u64` と取り違えないための newtype。間接参照・xref エントリ・キャッシュキーの
//! 構成要素として用いる。ISO 32000-1 §7.3.10 が「positive integer object number」と
//! 規定するとおり、本型が表せるのは 1 以上の番号だけである（内部表現 `NonZeroU64`）。
//!
//! # 既存方針からの逸脱について
//!
//! 本クレートの newtype（`ByteOffset` / `PdfName` など）は「生成は無検証、妥当性検証は
//! 上位の責務」を方針としており、本型も当初はその側に立って 0 を無条件に受理していた。
//! #334 でこれを改め、`KeyLength`（`crate::encrypt::algorithm::KeyLength`）と同じく
//! 検証付きの構築だけを持つ。0 を保持したまま下流へ流すと、xref レイヤと解決レイヤの
//! 双方で「0 かどうか」を再検証する必要があり、検証基準が呼び出し箇所ごとに散らばるため。
//! §7.5.4 のフリーリストが持つリンク値（0 を含む）は [`FreeObjectNumber`] が担う。
//!
//! 構築経路は [`ObjectNumber::new`]（`u64` 用）と [`ObjectNumber::try_from_i64`]
//! （lexer のトークン用）の 2 つだけで、どちらも `Option` を返す。失敗理由が「0 だった」
//! （`try_from_i64` は加えて「負値だった」）の一択で追加情報が無いため、
//! `KeyLength::from_bits` や `GenerationNumber::try_from_u64` と同じく `TryFrom` や
//! 専用エラー型は設けない。
//!
//! [`FreeObjectNumber`]: crate::object::free_object_number::FreeObjectNumber

use std::fmt;
use std::num::NonZeroU64;

/// PDF オブジェクト番号。間接オブジェクトを一意に識別する正整数のラッパ。
///
/// 内部表現は `NonZeroU64`（docs/specs/01_lexical_conventions.md §4.4 の u32 とは意図的に乖離。
/// Issue #255 指定の `u64` 幅を保ちつつ、#334 で 0 を型レベルで排除した）。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは内部値の自然な振る舞いに従う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct ObjectNumber(NonZeroU64);

impl ObjectNumber {
    /// 与えられた `u64` から `ObjectNumber` を生成する。0 は `None` を返す。
    ///
    /// ISO 32000-1 §7.3.10 のオブジェクト番号は正整数であり、0 は §7.5.4 の
    /// フリーリスト先頭に予約された番号で間接オブジェクトを指さない。
    /// 失敗理由が「0 である」の一択で追加情報が無いため、エラー型を持つ `TryFrom` では
    /// なく `Option` を返す（`KeyLength::from_bits` と同じ方針）。
    pub fn new(n: u64) -> Option<Self> {
        NonZeroU64::new(n).map(Self)
    }

    /// `i64` のトークン値から `ObjectNumber` を生成する。負値と 0 は `None` を返す。
    ///
    /// lexer が返す `Primitive::Integer` は `i64` だが、オブジェクト番号は正整数
    /// （ISO 32000-1 §7.3.10）であり `i64` の負領域と 0 は番号として表現できない。
    /// この絞り込みをコンストラクタに閉じ込めることで、呼び出し側に
    /// `n >= 1` の判定と `n as u64` のキャストを書かせない。
    ///
    /// 失敗理由が呼び出し側の文脈ごとに違う扱いになる（ヘッダ位置ではパースエラー、
    /// 参照 lookahead では null オブジェクト）ため、エラー型を固定する `TryFrom` では
    /// なく `Option` を返す関連関数とする。
    #[must_use]
    pub fn try_from_i64(n: i64) -> Option<Self> {
        u64::try_from(n).ok().and_then(Self::new)
    }

    /// 内部のオブジェクト番号を `u64` として取り出す。返る値は必ず 1 以上。
    #[must_use]
    pub fn value(&self) -> u64 {
        self.0.get()
    }
}

impl From<ObjectNumber> for u64 {
    /// `ObjectNumber` から内部の `u64` を取り出す逆方向の変換経路。
    ///
    /// 出力方向は `u64` 全域へのロスレスな全域変換なので `From` を提供する
    /// （入力方向は 0 を弾く必要があるため `From` を持たず、`new` の `Option` に限る）。
    /// 既存の `value()` と結果は等価。
    /// 本型は `Copy` なので本変換に渡したあとも元の値は使い続けられる。`value()` は
    /// `&ObjectNumber` しか手元にない場面で自動参照外しにより値だけ取り出せる経路として
    /// 引き続き提供する（どちらも残す）。
    fn from(number: ObjectNumber) -> Self {
        number.0.get()
    }
}

/// 内部のオブジェクト番号を装飾なしで出力する（型名などを付け足さない）。
///
/// 現時点でクレート内に書式化の呼び出し元はないが、値ラッパ newtype 3 型で同じ変換集合を
/// 持たせるために実装する（型ごとに標準変換が不揃いな状態を解消する）。実装は内部 `u64` の
/// `Display` へ**委譲**する。`write!(f, "{}", self.0)` と書くと呼び出し側が `Formatter` に
/// 載せた書式指定（幅・ゼロ埋め・寄せ）が捨てられ、`format!("{:06}", number)` が `"42"` に
/// なってしまう。委譲すれば既定の `{}` は `"42"` のまま、`{:06}` は `"000042"` と
/// 期待どおりに働く。`Debug` は derive のまま（`ObjectNumber(42)`）とし、開発者向け
/// ダンプとの役割分離を保つ。
impl fmt::Display for ObjectNumber {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::collections::HashSet;

    /// 正整数から `ObjectNumber` を作るテスト用ヘルパ。
    fn number(n: u64) -> ObjectNumber {
        ObjectNumber::new(n).expect("positive object number")
    }

    #[test]
    fn new_then_value_roundtrips() {
        // 代表値（1 / 42 / u64::MAX）を new で包んで value で取り出すと、生成時の値と一致することを確認する
        for n in [1, 42, u64::MAX] {
            assert_eq!(
                number(n).value(),
                n,
                "ObjectNumber::new({n}) should keep its value"
            );
        }
    }

    #[test]
    fn new_rejects_zero() {
        // ISO 32000-1 §7.3.10 に反する 0 が拒否されることを確認する
        assert_eq!(ObjectNumber::new(0), None);
    }

    #[test]
    fn new_accepts_one() {
        // 正整数の下限 1 が受理されることを確認する
        assert_eq!(ObjectNumber::new(1).map(|n| n.value()), Some(1));
    }

    #[test]
    fn try_from_i64_accepts_positive_values() {
        // 代表的な正値（1 / 42）が受理され、value() が入力と一致することを確認する
        for n in [1i64, 42] {
            assert_eq!(
                ObjectNumber::try_from_i64(n).map(|number| number.value()),
                Some(n as u64),
                "try_from_i64({n}) should be accepted"
            );
        }
    }

    #[test]
    fn try_from_i64_accepts_i64_max() {
        // 参照解析で実際に到達する上限 i64::MAX が受理され、値が保持されることを確認する
        assert_eq!(
            ObjectNumber::try_from_i64(i64::MAX),
            Some(number(i64::MAX as u64))
        );
    }

    #[test]
    fn try_from_i64_rejects_zero() {
        // 正整数の外側 0 が拒否されることを確認する（#334）
        assert_eq!(ObjectNumber::try_from_i64(0), None);
    }

    #[test]
    fn try_from_i64_rejects_negative_one() {
        // 非負領域のすぐ外側 -1 が拒否されることを確認する
        assert_eq!(ObjectNumber::try_from_i64(-1), None);
    }

    #[test]
    fn try_from_i64_rejects_i64_min() {
        // as キャストなら値が化ける i64::MIN が拒否されることを確認する
        assert_eq!(ObjectNumber::try_from_i64(i64::MIN), None);
    }

    #[test]
    fn try_from_i64_agrees_with_new_for_accepted_values() {
        // 受理される値では try_from_i64 と new が等価な ObjectNumber を作ることを確認する
        for n in [1i64, 42, i64::MAX] {
            assert_eq!(
                ObjectNumber::try_from_i64(n),
                ObjectNumber::new(n as u64),
                "try_from_i64({n}) should agree with new"
            );
        }
    }

    #[test]
    fn into_u64_returns_inner_value() {
        // ObjectNumber から u64 への From が内部の生値を返すことを確認する
        assert_eq!(u64::from(number(42)), 42);
    }

    #[test]
    fn into_u64_matches_value() {
        // From と value() がどちらも同じ生値を返すことを確認する
        let n = number(7);
        assert_eq!(u64::from(n), n.value());
    }

    #[test]
    fn new_then_into_roundtrips() {
        // 代表値（1 / 42 / u64::MAX）を u64 -> ObjectNumber -> u64 と往復させても
        // 入力と一致する（出力方向の From が無損失である）ことを確認する
        for n in [1, 42, u64::MAX] {
            assert_eq!(
                u64::from(number(n)),
                n,
                "roundtrip of {n} should be lossless"
            );
        }
    }

    #[test]
    fn new_u64_max_builds_object_number() {
        // 上限 u64::MAX が受理され、値が保持されることを確認する
        assert_eq!(
            ObjectNumber::new(u64::MAX).map(|n| n.value()),
            Some(u64::MAX)
        );
    }

    #[test]
    fn display_renders_decimal() {
        // Display が内部値の 10 進表記のみを出力することを確認する
        assert_eq!(format!("{}", number(42)), "42");
    }

    #[test]
    fn display_renders_one() {
        // 下限 1 の書式化が "1" になることを確認する
        assert_eq!(format!("{}", number(1)), "1");
    }

    #[test]
    fn display_renders_u64_max() {
        // 上限 u64::MAX が桁落ちせず 10 進表記されることを確認する
        assert_eq!(format!("{}", number(u64::MAX)), "18446744073709551615");
    }

    #[test]
    fn display_omits_type_name_decoration() {
        // Display は値のみ、Debug は型名付きという役割分離を固定する
        let n = number(42);
        assert_eq!(format!("{n}"), "42");
        assert_eq!(format!("{n:?}"), "ObjectNumber(42)");
    }

    #[test]
    fn display_respects_width_and_zero_pad() {
        // 呼び出し側が指定した幅・ゼロ埋めが握り潰されず内部値の Display へ渡ることを確認する
        assert_eq!(format!("{:06}", number(42)), "000042");
    }

    #[test]
    fn rejects_zero() {
        // フリーリスト先頭の予約番号 0 は ObjectNumber として構築できないことを確認する
        assert!(ObjectNumber::new(0).is_none());
    }

    #[test]
    fn accepts_one() {
        // 1 が受理され、値が保持されることを確認する
        assert_eq!(number(1).value(), 1);
    }

    #[test]
    fn accepts_u64_max() {
        // 最大値 u64::MAX も受理され、値が保持されることを確認する
        assert_eq!(number(u64::MAX).value(), u64::MAX);
    }

    #[test]
    fn equal_numbers_are_equal() {
        // 同一値から生成した 2 つが == で等価と判定されることを確認する
        assert_eq!(number(7), number(7));
    }

    #[test]
    fn different_numbers_are_not_equal() {
        // 異なる値から生成した 2 つが != で非等価と判定されることを確認する
        assert_ne!(number(7), number(8));
    }

    #[test]
    fn orders_by_inner_value() {
        // 大小比較（< / >）が内部値の自然順に従うことを確認する
        assert!(number(1) < number(2));
        assert!(number(3) > number(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        // 順不同の配列を sort() すると内部値の昇順に並ぶことを確認する
        let mut numbers = [number(3), number(1), number(2)];
        numbers.sort();
        assert_eq!(numbers, [number(1), number(2), number(3)]);
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // Copy セマンティクスにより、別変数へ複製した後も元の変数が引き続き使用可能なことを確認する
        let original = number(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        // HashMap のキーとして機能し、同値キーで挿入した値を取得できることを確認する
        let mut map = HashMap::new();
        map.insert(number(10), "ten");
        assert_eq!(map.get(&number(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値を HashSet に 2 回挿入しても等価キーが 1 件に畳まれることを確認する
        let mut set = HashSet::new();
        set.insert(number(3));
        set.insert(number(3));
        assert_eq!(set.len(), 1);
    }
}
