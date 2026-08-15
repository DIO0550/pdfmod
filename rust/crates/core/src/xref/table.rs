//! xref テーブル `XRefTable` を定義するモジュール。
//!
//! オブジェクト番号から `XRefEntry` を引くための表。
//! 従来型 xref テーブル（#584）と xref ストリーム（#588）のどちらを解析した結果も
//! この型に集約され、上位のオブジェクト解決層は出所を意識せずに扱える。
//! 世代番号の照合・オフセットの妥当性検証は行わない（解決層の責務）。

use std::collections::hash_map::Entry;
use std::collections::HashMap;

use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;

/// xref テーブル。オブジェクト番号から xref エントリへの写像。
///
/// 内部表現は `HashMap<ObjectNumber, XRefEntry>`。
/// オブジェクト番号はインクリメンタル更新やフリーリストにより疎になりうるため、
/// 密配列ではなくハッシュマップを用いる。反復順は保証しない。
///
/// `insert` は**先勝ち**（既存エントリを上書きしない）。
/// xref チェーンを最新セクションから `/Prev` を辿って古いセクションへ読み進めると、
/// 先に読んだ新しいエントリがそのまま残る。
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct XRefTable {
    entries: HashMap<ObjectNumber, XRefEntry>,
}

impl XRefTable {
    /// 空の xref テーブルを生成する。
    #[must_use]
    pub fn new() -> XRefTable {
        XRefTable {
            entries: HashMap::new(),
        }
    }

    /// オブジェクト番号に対応するエントリを取得する。
    ///
    /// 登録されていない番号なら `None`。
    /// free エントリとして登録済みの番号は `Some(XRefEntry::Free { .. })` を返すため、
    /// 「未登録」と「free として登録済み」は呼び出し側で区別できる。
    /// 世代番号の照合は行わない。
    #[must_use]
    pub fn get(&self, number: ObjectNumber) -> Option<&XRefEntry> {
        self.entries.get(&number)
    }

    /// エントリを登録する。**先勝ち**で、既に同じオブジェクト番号が登録済みなら何もしない。
    ///
    /// 実際に挿入されたときだけ `true` を返す。
    /// 新しい xref セクションから古いセクションへ読み進める呼び出し側は、
    /// 優先度の制御をこの関数に任せられる。
    pub fn insert(&mut self, number: ObjectNumber, entry: XRefEntry) -> bool {
        match self.entries.entry(number) {
            Entry::Occupied(_) => false,
            Entry::Vacant(slot) => {
                slot.insert(entry);
                true
            }
        }
    }

    /// 登録済みエントリの件数を返す。
    #[must_use]
    pub fn len(&self) -> usize {
        self.entries.len()
    }

    /// 登録済みエントリが 1 件も無いかを返す。
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
}

#[cfg(test)]
mod tests;
