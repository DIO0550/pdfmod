//! PDF の間接オブジェクトの世代を表す世代番号 `GenerationNumber` を定義するモジュール。
//!
//! 裸の `u16` や隣接する `ObjectNumber` と取り違えないための newtype。
//! 間接参照・xref エントリ・`ObjectId`（#258）の構成要素として用いる。
//! 生成は無検証（infallible）で、0 や `u16::MAX`（= 65535）も無条件に受理する。
//! 0（フリーリスト先頭の予約世代）の特別扱い・世代不一致判定は xref レイヤ（後続）に委譲する。

use std::fmt;

/// PDF 世代番号。間接オブジェクトの世代（削除・再利用の管理）を表す整数のラッパ。
///
/// 内部表現は `u16`。仕様範囲 `0..=65535`（ISO 32000-1 §7.5.4）が `u16` の定義域と
/// 一致するため、型自体が仕様範囲を保証する（範囲外値は型レベルで表現不能）。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは内部 `u16` の自然な振る舞いに従う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct GenerationNumber(u16);

impl GenerationNumber {
    /// 与えられた `u16` から `GenerationNumber` を生成する。
    ///
    /// 無検証（infallible）。0 や `u16::MAX`（= 65535）を含む任意の値を受理する。
    pub fn new(n: u16) -> Self {
        Self(n)
    }

    /// 内部の世代番号を `u16` として取り出す。
    #[must_use]
    pub fn value(&self) -> u16 {
        self.0
    }
}

impl From<u16> for GenerationNumber {
    /// `u16` から `GenerationNumber` を生成する慣習的な変換経路。
    ///
    /// 仕様範囲 `0..=65535`（ISO 32000-1 §7.5.4）が `u16` の定義域と一致するため、
    /// 範囲外の入力は型レベルで表現できない。よって失敗しうる変換ではなく `From` を採用する。
    /// 既存の `new` は非破壊で残しており本変換は唯一の構築経路ではないが、`42u16.into()` /
    /// `GenerationNumber::from(42)` という標準的な書き方と、`impl Into<GenerationNumber>` を
    /// 受け取るジェネリック API を可能にする目的で併設する。
    fn from(n: u16) -> Self {
        Self(n)
    }
}

impl From<GenerationNumber> for u16 {
    /// `GenerationNumber` から内部の `u16` を取り出す逆方向の変換経路。
    ///
    /// ロスレスな変換は双方向に `From` を提供するのが Rust API Guidelines (C-CONV) の
    /// 推奨であるため、入力方向とあわせて実装する。既存の `value()` と結果は等価。
    /// 本型は `Copy` なので本変換に渡したあとも元の値は使い続けられる。`value()` は
    /// `&GenerationNumber` しか手元にない場面で自動参照外しにより値だけ取り出せる経路として
    /// 引き続き提供する（どちらも残す）。
    fn from(number: GenerationNumber) -> Self {
        number.0
    }
}

/// 内部の世代番号を装飾なしで出力する（型名などを付け足さない）。
///
/// 現時点でクレート内に書式化の呼び出し元はないが、値ラッパ newtype 3 型で同じ変換集合を
/// 持たせるために実装する（型ごとに標準変換が不揃いな状態を解消する）。実装は内部 `u16` の
/// `Display` へ**委譲**する。xref エントリの世代番号は 5 桁ゼロ埋め（ISO 32000-1 §7.5.4）
/// であり、`write!(f, "{}", self.0)` と書くと呼び出し側が `Formatter` に載せた書式指定
/// （幅・ゼロ埋め・寄せ）が捨てられ、`format!("{:05}", generation)` が `"0"` になって
/// 壊れた固定長を静かに生む。委譲すれば既定の `{}` は従来どおりゼロ埋めなしの `"0"` を、
/// `{:05}` は `"00000"` を返す。`Debug` は derive のまま（`GenerationNumber(42)`）とし、
/// 開発者向けダンプとの役割分離を保つ。
impl fmt::Display for GenerationNumber {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(&self.0, f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::collections::HashSet;

    #[test]
    fn new_then_value_roundtrips() {
        // new(n) で包んだ値を value() で取り出すと入力 n と一致する。
        // 代表値 [0, 1, 42, u16::MAX] で生成と取り出しが無損失（ラウンドトリップ）であることを確認する。
        for n in [0, 1, 42, u16::MAX] {
            assert_eq!(GenerationNumber::new(n).value(), n);
        }
    }

    #[test]
    fn from_u16_builds_generation_number() {
        // u16 から From で変換した結果が new で生成した GenerationNumber と等価になることを確認する
        assert_eq!(GenerationNumber::from(42), GenerationNumber::new(42));
    }

    #[test]
    fn into_generation_number_from_u16() {
        // u16 側から .into() を呼ぶ経路でも同じ GenerationNumber が得られることを確認する
        let generation: GenerationNumber = 42u16.into();
        assert_eq!(generation, GenerationNumber::new(42));
    }

    #[test]
    fn unsuffixed_integer_literal_into_resolves_uniquely() {
        // サフィックスなし整数リテラルの .into() が候補一意で u16 に推論されることを確認する
        // （候補が一意なので i32 フォールバックは起きない。From<u32> 等を後から足すと壊れる回帰ガード）
        let generation: GenerationNumber = 42.into();
        assert_eq!(generation, GenerationNumber::new(42));
    }

    #[test]
    fn into_u16_returns_inner_value() {
        // GenerationNumber から u16 への逆方向 From が内部の生値を返すことを確認する
        let generation = GenerationNumber::new(42);
        assert_eq!(u16::from(generation), 42);
    }

    #[test]
    fn from_matches_new() {
        // 新設の From と既存 new が同じ値の GenerationNumber を作ることを確認する
        assert_eq!(GenerationNumber::from(7), GenerationNumber::new(7));
    }

    #[test]
    fn into_u16_matches_value() {
        // 逆方向 From と既存 value() がどちらも同じ生値を返すことを確認する
        let generation = GenerationNumber::new(7);
        assert_eq!(u16::from(generation), generation.value());
    }

    #[test]
    fn from_then_into_roundtrips() {
        // 代表値（0 / 1 / 42 / u16::MAX）を u16 → GenerationNumber → u16 と往復させても
        // 入力と一致する（双方向 From が無損失である）ことを確認する
        for n in [0, 1, 42, u16::MAX] {
            assert_eq!(u16::from(GenerationNumber::from(n)), n);
        }
    }

    #[test]
    fn from_zero_builds_generation_number() {
        // フリーリスト先頭の予約世代 0 を From で変換しても値が保持されることを確認する
        assert_eq!(GenerationNumber::from(0), GenerationNumber::new(0));
    }

    #[test]
    fn from_u16_max_builds_generation_number() {
        // 仕様上限 u16::MAX（= 65535）を From で変換しても値が保持されることを確認する
        assert_eq!(
            GenerationNumber::from(u16::MAX),
            GenerationNumber::new(u16::MAX)
        );
    }

    #[test]
    fn display_renders_decimal() {
        // Display が内部値の 10 進表記のみを出力することを確認する
        assert_eq!(format!("{}", GenerationNumber::new(42)), "42");
    }

    #[test]
    fn display_renders_zero() {
        // 書式指定なしの 0 は既定ではゼロ埋めせず "0" になることを確認する
        assert_eq!(format!("{}", GenerationNumber::new(0)), "0");
    }

    #[test]
    fn display_renders_one() {
        // 1 の書式化が "1" になることを確認する
        assert_eq!(format!("{}", GenerationNumber::new(1)), "1");
    }

    #[test]
    fn display_renders_u16_max() {
        // 仕様上限 u16::MAX（= 65535）が桁落ちせず 10 進表記されることを確認する
        assert_eq!(format!("{}", GenerationNumber::new(u16::MAX)), "65535");
    }

    #[test]
    fn display_omits_type_name_decoration() {
        // Display は値のみ、Debug は型名付きという役割分離を固定する
        let generation = GenerationNumber::new(42);
        assert_eq!(format!("{generation}"), "42");
        assert_eq!(format!("{generation:?}"), "GenerationNumber(42)");
    }

    #[test]
    fn display_respects_width_and_zero_pad() {
        // 呼び出し側が指定した幅・ゼロ埋めが握り潰されず内部 u16 の Display へ渡ることを確認する
        // （xref エントリの世代番号は 5 桁ゼロ埋め固定長・ISO 32000-1 §7.5.4）
        assert_eq!(format!("{:05}", GenerationNumber::new(0)), "00000");
    }

    #[test]
    fn accepts_zero() {
        // 0（フリーオブジェクトの予約世代）を無検証で受理し、value() が 0 を返す。
        assert_eq!(GenerationNumber::new(0).value(), 0);
    }

    #[test]
    fn accepts_one() {
        // 1（最小の「使用中」通常世代）を受理し、value() が 1 を返す。
        assert_eq!(GenerationNumber::new(1).value(), 1);
    }

    #[test]
    fn accepts_u16_max() {
        // u16::MAX（= 65535、ISO 32000-1 §7.5.4 の世代上限）を受理し、範囲上限を取り出せる。
        assert_eq!(GenerationNumber::new(u16::MAX).value(), u16::MAX);
    }

    #[test]
    fn equal_numbers_are_equal() {
        // 同じ u16 から生成した 2 値は == で等価になる（PartialEq/Eq が内部値に委譲）。
        assert_eq!(GenerationNumber::new(7), GenerationNumber::new(7));
    }

    #[test]
    fn different_numbers_are_not_equal() {
        // 異なる u16 から生成した 2 値は != で非等価になる。
        assert_ne!(GenerationNumber::new(7), GenerationNumber::new(8));
    }

    #[test]
    fn orders_by_inner_value() {
        // < / > による大小比較が内部 u16 の大小と一致する（PartialOrd/Ord が内部値に委譲）。
        assert!(GenerationNumber::new(1) < GenerationNumber::new(2));
        assert!(GenerationNumber::new(3) > GenerationNumber::new(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        // 配列を sort() すると内部 u16 の昇順に並ぶ（Ord により [3,1,2] → [1,2,3]）。
        let mut numbers = [
            GenerationNumber::new(3),
            GenerationNumber::new(1),
            GenerationNumber::new(2),
        ];
        numbers.sort();
        assert_eq!(
            numbers,
            [
                GenerationNumber::new(1),
                GenerationNumber::new(2),
                GenerationNumber::new(3),
            ]
        );
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // 代入でコピーしても元の値はムーブされず、コピーと等価のまま使い続けられる。
        let original = GenerationNumber::new(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        // HashMap のキーとして使え、同値キーで get すると挿入値を取得できる（Hash + Eq）。
        let mut map = HashMap::new();
        map.insert(GenerationNumber::new(10), "ten");
        assert_eq!(map.get(&GenerationNumber::new(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値を 2 回挿入しても要素数は 1 になる（同値が 1 つに折りたたまれる）。
        let mut set = HashSet::new();
        set.insert(GenerationNumber::new(3));
        set.insert(GenerationNumber::new(3));
        assert_eq!(set.len(), 1);
    }
}
