//! オブジェクトストリーム解析で発生するエラー型（ISO 32000-1 §7.5.7）。

use std::fmt;

use crate::byte_offset::ByteOffset;
use crate::object::object_kind::ObjectKind;
use crate::object_stream::key::ObjectStreamKey;
use crate::parser::error::ParseErrorKind;

/// オブジェクトストリーム解析で発生するエラーの種別。
#[derive(Debug, Clone, PartialEq)]
pub enum ObjectStreamErrorKind {
    /// オブジェクトストリームではない（間接オブジェクトでない、ストリームでない、または `/Type` が `/ObjStm` でない）。
    NotAnObjectStream,
    /// 間接オブジェクトの構文解析に失敗した。
    ObjectParseFailed {
        /// 失敗原因
        kind: ParseErrorKind,
    },
    /// 必須キーが欠損している。
    MissingRequiredKey(ObjectStreamKey),
    /// キーの値の型が期待と異なる。
    InvalidKeyType {
        /// 対象キー
        key: ObjectStreamKey,
        /// 実際に得られた型
        actual: ObjectKind,
    },
    /// `/N` の値が不正（0 または負値）。
    InvalidN(i64),
    /// `/First` の値が不正（負値）。
    InvalidFirst(i64),
    /// `/First` が復号データ長を超えている。
    FirstOutOfBounds {
        /// `/First` の値
        first: usize,
        /// 復号データ長
        data_len: usize,
    },
    /// オフセットテーブル内のペア数が `/N` と不一致。
    PairCountMismatch {
        /// `/N` で宣言されたオブジェクト数
        expected: usize,
        /// 実際に読み取れたペア数
        actual: usize,
    },
    /// 不正なオブジェクト番号（0 または負値）。
    InvalidObjectNumber(i64),
    /// 不正な相対オフセット値（負値）。
    InvalidOffset(i64),
    /// オフセットテーブルの相対オフセットがデータ領域長を超えている。
    OffsetOutOfBounds {
        /// `/First` からの相対オフセット
        offset: usize,
        /// 利用可能なデータ領域長
        available_len: usize,
    },
    /// 指定されたインデックスが範囲外。
    IndexOutOfBounds {
        /// 要求されたインデックス
        index: usize,
        /// オブジェクトストリーム内の総オブジェクト数
        count: usize,
    },
    /// サポートされていないフィルタが指定された。
    UnsupportedFilter,
    /// ストリームの復号に失敗した。
    StreamDecodeFailed,
    /// オブジェクトストリーム内にストリームオブジェクトが含まれている（ISO 32000-1 §7.5.7 違反）。
    StreamInObjectStream,
    /// 内部オブジェクトのパースに失敗した。
    InnerObjectParseFailed {
        /// 失敗原因
        kind: ParseErrorKind,
    },
}

/// オブジェクトストリーム解析で発生したエラー。
#[derive(Debug, Clone, PartialEq)]
pub struct ObjectStreamError {
    /// エラーの種別
    pub kind: ObjectStreamErrorKind,
    /// エラーが発生したバイトオフセット
    pub position: ByteOffset,
}

impl ObjectStreamError {
    /// 新しい [`ObjectStreamError`] を構築する。
    #[inline]
    #[must_use]
    pub const fn new(kind: ObjectStreamErrorKind, position: ByteOffset) -> Self {
        Self { kind, position }
    }
}

impl fmt::Display for ObjectStreamError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "object stream error at {}: {:?}",
            self.position, self.kind
        )
    }
}

impl std::error::Error for ObjectStreamError {}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn display_format() {
        let err = ObjectStreamError::new(
            ObjectStreamErrorKind::NotAnObjectStream,
            ByteOffset::new(42),
        );
        let s = format!("{err}");
        assert!(s.contains("42"));
        assert!(s.contains("NotAnObjectStream"));
    }
}
