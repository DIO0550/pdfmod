//! PDF 基本識別子型（ISO 32000-1:2008 §7.3）。
//!
//! TS 版 (`packages/core/src/pdf/types`) の Brand + companion object パターンを
//! Rust の newtype + 関連関数に移植したもの。
//!
//! - `of()`     — 検証なしの構築（TS の `.of()` 相当）
//! - `create()` — 範囲検証付きの構築。`Result<Self, String>` を返す（TS の `.create()` 相当）
//! - `value()`  — 内部の生値を取り出す
//!
//! ## 整数型の選定
//!
//! TS は全て `number` だが、Rust では各フィールドの幅を明示的に選ぶ。
//! - [`ObjectNumber`]      — xref のオブジェクト番号は最大 10 桁 (9_999_999_999) で
//!   `u32`(~4.29e9) を超えるため **`u64`**。
//! - [`GenerationNumber`]  — 世代番号は最大 5 桁 (65535) で `u16` にちょうど収まる → **`u16`**。
//! - [`ByteOffset`]        — ファイル内オフセットは **`u64`**。

/// オブジェクト番号（ISO 32000 §7.3.10）。
///
/// xref のオブジェクト番号フィールドは最大 10 桁（9_999_999_999）まで取りうる。
/// これは `u32` の上限を超えるため、内部表現に `u64` を採用する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ObjectNumber(u64);

impl ObjectNumber {
    /// PDF 仕様上のオブジェクト番号最大値（10 桁）。
    pub const MAX: u64 = 9_999_999_999;

    /// 検証なしで構築する。
    pub const fn of(n: u64) -> Self {
        Self(n)
    }

    /// 範囲検証付きで構築する。10 桁を超える場合は `Err`。
    pub fn create(n: u64) -> Result<Self, String> {
        if n > Self::MAX {
            return Err(format!(
                "Invalid ObjectNumber: {n} (must be <= {})",
                Self::MAX
            ));
        }
        Ok(Self(n))
    }

    /// 内部の数値を取り出す。
    pub const fn value(self) -> u64 {
        self.0
    }
}

/// 世代番号（ISO 32000 §7.3.10）。
///
/// 世代番号は最大 5 桁（65535）で、`u16` の上限とちょうど一致する。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct GenerationNumber(u16);

impl GenerationNumber {
    /// PDF 仕様上の世代番号最大値（5 桁）。`u16::MAX` と一致する。
    pub const MAX: u16 = 65_535;

    /// 検証なしで構築する。
    pub const fn of(n: u16) -> Self {
        Self(n)
    }

    /// 構築する。`u16` の値域に収まる限り常に成功するが、TS 版 `.create()` との
    /// API 対称性のため `Result` を返す。
    pub fn create(n: u16) -> Result<Self, String> {
        Ok(Self(n))
    }

    /// 内部の数値を取り出す。
    pub const fn value(self) -> u16 {
        self.0
    }
}

/// ファイル内のバイトオフセット。
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct ByteOffset(u64);

impl ByteOffset {
    /// 検証なしで構築する。
    pub const fn of(n: u64) -> Self {
        Self(n)
    }

    /// 内部の数値を取り出す。
    pub const fn value(self) -> u64 {
        self.0
    }
}

/// 間接オブジェクト参照（例: `5 0 R`、ISO 32000 §7.3.10）。
///
/// オブジェクト番号と世代番号の組でオブジェクトを一意に指す。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct IndirectRef {
    /// オブジェクト番号。
    pub object_number: ObjectNumber,
    /// 世代番号。
    pub generation_number: GenerationNumber,
}

impl IndirectRef {
    /// 構築する。
    pub const fn new(object_number: ObjectNumber, generation_number: GenerationNumber) -> Self {
        Self {
            object_number,
            generation_number,
        }
    }
}

/// オブジェクト識別子。エラー報告などでオブジェクトを指すために使う。
/// 形は [`IndirectRef`] と同一（オブジェクト番号 + 世代番号）。
pub type ObjectId = IndirectRef;
