//! PDF ファイル内のバイトオフセット（先頭からの位置）を表す `ByteOffset` を定義するモジュール。
//!
//! 裸の `u64` と取り違えないための newtype。xref が指す間接オブジェクトのファイル内位置などの
//! 構成要素として用いる。生成は無検証（infallible）で、0（ファイル先頭）や `u64::MAX` も
//! 無条件に受理する。値の妥当性検証（ファイルサイズ超過等）は xref レイヤ（R2）に委譲する。

use std::fmt;

/// PDF ファイル内のバイトオフセット。ファイル先頭からの位置を表す非負整数のラッパ。
///
/// 内部表現は `u64`（Issue #257 指定）。
/// 値ラッパであり `Copy`。等価・順序・ハッシュは内部 `u64` の自然な振る舞いに従う。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[must_use]
pub struct ByteOffset(u64);

impl ByteOffset {
    /// 与えられた `u64` から `ByteOffset` を生成する。
    ///
    /// 無検証（infallible）。0 や `u64::MAX` を含む任意の値を受理する。
    pub fn new(n: u64) -> ByteOffset {
        ByteOffset(n)
    }

    /// 内部のバイトオフセットを `u64` として取り出す。
    #[must_use]
    pub fn value(&self) -> u64 {
        self.0
    }

    /// 2 つのオフセットを加算する。オーバーフローする場合は `None`。
    ///
    /// ヘッダがファイル先頭にない PDF で、xref の記録値を実位置へ補正する用途を想定する。
    #[must_use]
    pub fn checked_add(self, other: ByteOffset) -> Option<ByteOffset> {
        self.0.checked_add(other.0).map(ByteOffset::new)
    }
}

impl From<u64> for ByteOffset {
    /// `u64` から `ByteOffset` を生成する慣習的な変換経路。
    ///
    /// `u64` の定義域が `ByteOffset` の定義域と完全に一致するロスレスな全域変換であり、
    /// panic する経路を持たないため `TryFrom` ではなく `From` を採用する。既存の
    /// `new` は非破壊で残しており本変換は唯一の構築経路ではないが、`42u64.into()` /
    /// `ByteOffset::from(42)` という標準的な書き方と、`impl Into<ByteOffset>` を
    /// 受け取るジェネリック API を可能にする目的で併設する。
    fn from(n: u64) -> ByteOffset {
        ByteOffset(n)
    }
}

impl From<ByteOffset> for u64 {
    /// `ByteOffset` から内部の `u64` を取り出す逆方向の変換経路。
    ///
    /// ロスレスな変換は双方向に `From` を提供するのが Rust API Guidelines (C-CONV) の
    /// 推奨であるため、入力方向とあわせて実装する。既存の `value()` と結果は等価。
    /// 本型は `Copy` なので本変換に渡したあとも元の値は使い続けられる。`value()` は
    /// `&ByteOffset` しか手元にない場面で自動参照外しにより値だけ取り出せる経路として
    /// 引き続き提供する（どちらも残す）。
    fn from(offset: ByteOffset) -> u64 {
        offset.0
    }
}

/// 内部のバイトオフセットを装飾なしで出力する（型名などを付け足さない）。
///
/// `" at byte {}"` のような文脈は書式化の呼び出し側が持つため、型側は値だけを出す。
/// 実装は内部 `u64` の `Display` へ**委譲**する。`write!(f, "{}", self.0)` と書くと
/// 呼び出し側が `Formatter` に載せた書式指定（幅・ゼロ埋め・寄せ）が捨てられ、
/// `format!("{:010}", offset)` が `"42"` になってしまう。xref エントリは
/// オフセット 10 桁・世代番号 5 桁のゼロ埋め固定長（ISO 32000-1 §7.5.4）であり、
/// 書式指定が黙って無視されると壊れた出力を静かに生む。委譲すれば既定の `{}` は
/// 従来どおり `"42"` のまま、`{:010}` は `"0000000042"` と期待どおりに働く。
/// `Debug` は derive のまま（`ByteOffset(42)`）とし、開発者向けダンプとの役割分離を保つ。
impl fmt::Display for ByteOffset {
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
    fn checked_add_values_in_range_returns_sum() {
        // 通常範囲の 2 オフセットを加算すると合計値を返すことを確認する
        assert_eq!(
            ByteOffset::new(37).checked_add(ByteOffset::new(500)),
            Some(ByteOffset::new(537))
        );
    }

    #[test]
    fn checked_add_boundary_values_returns_expected_option() {
        // 境界値の加算とオーバーフローを安全に判定できることを確認する
        let cases = [
            (0, 0, Some(ByteOffset::new(0))),
            (u64::MAX, 0, Some(ByteOffset::new(u64::MAX))),
            (u64::MAX, 1, None),
        ];
        for (left, right, expected) in cases {
            assert_eq!(
                ByteOffset::new(left).checked_add(ByteOffset::new(right)),
                expected
            );
        }
    }

    #[test]
    fn new_then_value_roundtrips() {
        // 代表値（0 / 1 / 42 / u64::MAX）を new で包んで value で取り出すと、生成時の値と一致することを確認する
        for n in [0, 1, 42, u64::MAX] {
            assert_eq!(ByteOffset::new(n).value(), n);
        }
    }

    #[test]
    fn from_u64_builds_offset() {
        // u64 から From で変換した結果が new で生成した ByteOffset と等価になることを確認する
        assert_eq!(ByteOffset::from(42), ByteOffset::new(42));
    }

    #[test]
    fn into_offset_from_u64() {
        // u64 側から .into() を呼ぶ経路でも同じ ByteOffset が得られることを確認する
        let offset: ByteOffset = 42u64.into();
        assert_eq!(offset, ByteOffset::new(42));
    }

    #[test]
    fn unsuffixed_integer_literal_into_resolves_uniquely() {
        // サフィックスなし整数リテラルの .into() が候補一意で u64 に推論されることを確認する
        // （From<u32> 等を後から足すと E0283 でコンパイルが落ちる回帰ガード）
        let offset: ByteOffset = 42.into();
        assert_eq!(offset, ByteOffset::new(42));
    }

    #[test]
    fn into_u64_returns_inner_value() {
        // ByteOffset から u64 への逆方向 From が内部の生値を返すことを確認する
        let offset = ByteOffset::new(42);
        assert_eq!(u64::from(offset), 42);
    }

    #[test]
    fn from_matches_new() {
        // 新設の From と既存 new が同じ値の ByteOffset を作ることを確認する
        assert_eq!(ByteOffset::from(7), ByteOffset::new(7));
    }

    #[test]
    fn into_u64_matches_value() {
        // 逆方向 From と既存 value() がどちらも同じ生値を返すことを確認する
        let offset = ByteOffset::new(7);
        assert_eq!(u64::from(offset), offset.value());
    }

    #[test]
    fn from_then_into_roundtrips() {
        // 代表値（0 / 1 / 42 / u64::MAX）を u64 → ByteOffset → u64 と往復させても
        // 入力と一致する（双方向 From が無損失である）ことを確認する
        for n in [0, 1, 42, u64::MAX] {
            assert_eq!(u64::from(ByteOffset::from(n)), n);
        }
    }

    #[test]
    fn from_zero_builds_offset() {
        // ファイル先頭を表す 0 を From で変換しても値が保持されることを確認する
        assert_eq!(ByteOffset::from(0), ByteOffset::new(0));
    }

    #[test]
    fn from_u64_max_builds_offset() {
        // 上限 u64::MAX を From で変換しても値が保持されることを確認する
        assert_eq!(ByteOffset::from(u64::MAX), ByteOffset::new(u64::MAX));
    }

    #[test]
    fn display_renders_decimal() {
        // Display が内部値の 10 進表記のみを出力することを確認する
        assert_eq!(format!("{}", ByteOffset::new(42)), "42");
    }

    #[test]
    fn display_renders_zero() {
        // 0 の書式化が空文字列にならず "0" になることを確認する
        assert_eq!(format!("{}", ByteOffset::new(0)), "0");
    }

    #[test]
    fn display_renders_one() {
        // 1 の書式化が "1" になることを確認する
        assert_eq!(format!("{}", ByteOffset::new(1)), "1");
    }

    #[test]
    fn display_renders_u64_max() {
        // 上限 u64::MAX が桁落ちせず 10 進表記されることを確認する
        assert_eq!(
            format!("{}", ByteOffset::new(u64::MAX)),
            "18446744073709551615"
        );
    }

    #[test]
    fn display_omits_type_name_decoration() {
        // Display は値のみ、Debug は型名付きという役割分離を固定する
        let offset = ByteOffset::new(42);
        assert_eq!(format!("{offset}"), "42");
        assert_eq!(format!("{offset:?}"), "ByteOffset(42)");
    }

    #[test]
    fn display_respects_width_and_zero_pad() {
        // 呼び出し側が指定した幅・ゼロ埋めが握り潰されず内部 u64 の Display へ渡ることを確認する
        // （xref エントリのオフセットは 10 桁ゼロ埋め固定長・ISO 32000-1 §7.5.4）
        assert_eq!(format!("{:010}", ByteOffset::new(42)), "0000000042");
    }

    #[test]
    fn accepts_zero() {
        // ファイル先頭を表す 0 が無検証で受理され、値が保持されることを確認する
        assert_eq!(ByteOffset::new(0).value(), 0);
    }

    #[test]
    fn accepts_one() {
        // 1 が無検証で受理され、値が保持されることを確認する
        assert_eq!(ByteOffset::new(1).value(), 1);
    }

    #[test]
    fn accepts_u64_max() {
        // 最大値 u64::MAX も無検証で受理され、値が保持されることを確認する
        assert_eq!(ByteOffset::new(u64::MAX).value(), u64::MAX);
    }

    #[test]
    fn equal_offsets_are_equal() {
        // 同一値から生成した 2 つが == で等価と判定されることを確認する
        assert_eq!(ByteOffset::new(7), ByteOffset::new(7));
    }

    #[test]
    fn different_offsets_are_not_equal() {
        // 異なる値から生成した 2 つが != で非等価と判定されることを確認する
        assert_ne!(ByteOffset::new(7), ByteOffset::new(8));
    }

    #[test]
    fn orders_by_inner_value() {
        // 大小比較（< / >）が内部 u64 の自然順に従うことを確認する
        assert!(ByteOffset::new(1) < ByteOffset::new(2));
        assert!(ByteOffset::new(3) > ByteOffset::new(2));
    }

    #[test]
    fn sorts_in_ascending_order() {
        // 順不同の配列を sort() すると内部 u64 の昇順に並ぶことを確認する
        let mut offsets = [ByteOffset::new(3), ByteOffset::new(1), ByteOffset::new(2)];
        offsets.sort();
        assert_eq!(
            offsets,
            [ByteOffset::new(1), ByteOffset::new(2), ByteOffset::new(3),]
        );
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // Copy セマンティクスにより、別変数へ複製した後も元の変数が引き続き使用可能なことを確認する
        let original = ByteOffset::new(5);
        let copied = original;
        assert_eq!(original.value(), 5);
        assert_eq!(original, copied);
    }

    #[test]
    fn works_as_hash_map_key() {
        // HashMap のキーとして機能し、同値キーで挿入した値を取得できることを確認する
        let mut map = HashMap::new();
        map.insert(ByteOffset::new(10), "ten");
        assert_eq!(map.get(&ByteOffset::new(10)), Some(&"ten"));
    }

    #[test]
    fn equal_keys_collapse_in_hash_set() {
        // 同値を HashSet に 2 回挿入しても等価キーが 1 件に畳まれることを確認する
        let mut set = HashSet::new();
        set.insert(ByteOffset::new(3));
        set.insert(ByteOffset::new(3));
        assert_eq!(set.len(), 1);
    }
}
