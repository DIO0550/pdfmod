//! PDF オブジェクトモデル（ISO 32000-1:2008 §7.3）。
//!
//! TS 版 `packages/core/src/pdf/types/pdf-types` の discriminated union を
//! Rust の `enum` に移植したもの。

use std::collections::HashMap;

use super::types::{ByteOffset, GenerationNumber, IndirectRef, ObjectNumber};

/// PDF 文字列のエンコード形式（ISO 32000 §7.3.4）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum StringEncoding {
    /// リテラル形式（括弧）。
    Literal,
    /// 16 進形式（山括弧）。
    Hex,
}

/// PDF 辞書（ISO 32000 §7.3.7）。キーは名前文字列、値は [`PdfObject`]。
///
/// NOTE: TS 版は挿入順を保つ `Map` を使う。`HashMap` は順序を保たないため、
/// 将来順序が必要になった場合は順序保持コレクションへの差し替えを検討すること。
pub type PdfDictionary = HashMap<String, PdfObject>;

/// PDF オブジェクト全体型（ISO 32000 §7.3）。
///
/// 9 つの基本型 + 間接参照 + stream を含む。
///
/// NOTE: TS 版は値型 `PdfValue`（stream を含まない）と
/// `PdfObject = PdfValue | PdfStream` を型レベルで分けている。
/// Rust では単一 enum にまとめ、[`PdfObject::Stream`] は間接オブジェクト本体
/// にのみ現れるという制約はドキュメント上の約束とする。
#[derive(Debug, Clone, PartialEq)]
pub enum PdfObject {
    /// null オブジェクト（§7.3.9）。
    Null,
    /// 真偽値オブジェクト（§7.3.2）。
    Boolean(bool),
    /// 整数オブジェクト（§7.3.3）。
    Integer(i64),
    /// 実数オブジェクト（§7.3.3）。
    Real(f64),
    /// 文字列オブジェクト（§7.3.4）。
    Str {
        /// 生バイト列。
        value: Vec<u8>,
        /// リテラル / 16 進いずれの形式で記述されていたか。
        encoding: StringEncoding,
    },
    /// 名前オブジェクト（§7.3.5）。
    Name(String),
    /// 配列オブジェクト（§7.3.6）。
    Array(Vec<PdfObject>),
    /// 辞書オブジェクト（§7.3.7）。
    Dictionary(PdfDictionary),
    /// 間接参照（§7.3.10）。
    Reference(IndirectRef),
    /// ストリームオブジェクト（§7.3.8）。間接オブジェクト本体にのみ現れる。
    Stream {
        /// ストリーム辞書。
        dictionary: PdfDictionary,
        /// 復号前の生データ。
        data: Vec<u8>,
    },
}

/// 間接オブジェクト（ISO 32000 §7.3.10）。`N G obj ... endobj` 全体を表す。
#[derive(Debug, Clone, PartialEq)]
pub struct PdfIndirectObject {
    /// N: オブジェクト番号。
    pub object_number: ObjectNumber,
    /// G: 世代番号。
    pub generation_number: GenerationNumber,
    /// 中身（値または stream）。
    pub body: PdfObject,
}

/// 相互参照エントリ（ISO 32000 Table 18）。
///
/// TS 版の `type: 0 | 1 | 2` による discriminated union を enum に移植したもの。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum XRefEntry {
    /// フリーオブジェクト（type 0）。削除済みオブジェクトのリンクリストを構成する。
    Free {
        /// 次のフリーオブジェクトの番号。
        next_free_object: ObjectNumber,
        /// 世代番号。
        generation_number: GenerationNumber,
    },
    /// 使用中の通常オブジェクト（type 1）。ファイル内バイトオフセットで位置を示す。
    Used {
        /// ファイル内バイトオフセット。
        offset: ByteOffset,
        /// 世代番号。
        generation_number: GenerationNumber,
    },
    /// オブジェクトストリーム内の圧縮オブジェクト（type 2）。
    Compressed {
        /// 親ストリームのオブジェクト番号。
        stream_object: ObjectNumber,
        /// ストリーム内インデックス。
        index_in_stream: u64,
    },
}

/// 相互参照テーブル。
#[derive(Debug, Clone, Default)]
pub struct XRefTable {
    /// オブジェクト番号 → エントリのマッピング。
    pub entries: HashMap<ObjectNumber, XRefEntry>,
    /// 最大オブジェクト番号 + 1。
    pub size: u64,
}
