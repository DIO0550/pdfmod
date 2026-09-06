//! xref エントリ `XRefEntry` を定義するモジュール。
//!
//! 相互参照テーブル（ISO 32000-1:2008 §7.5.4）と相互参照ストリーム（同 §7.5.8）は
//! 表現形式が異なるが、意味する情報は同じ 3 種類のエントリに集約される。
//! 本モジュールはその 3 種を判別可能な enum として表現し、
//! 「type と有効フィールドの対応」をコメントではなく型で保証する。
//! 解析（バイト列 → `XRefEntry`）は本モジュールの責務ではなく、後続の Issue で追加する。

use crate::byte_offset::ByteOffset;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;

/// xref エントリ。オブジェクト番号に対応する 1 件の相互参照情報を表す。
///
/// `docs/specs/02a_object_resolution.md` §2 の 3 種（free / in-use / compressed）に対応する。
/// 各バリアントが自分に必要なフィールドだけを持つため、
/// 「free なのにバイトオフセットを持つ」といった不正な状態は型レベルで表現できない。
///
/// 値ラッパの集合であり全フィールドが `Copy` なため `Copy`。等価・ハッシュは
/// バリアントとフィールド値に従う。順序（`PartialOrd` / `Ord`）はバリアント間に
/// 意味ある全順序がないため derive しない（`ByteKind` / `PdfObject` と同方針）。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
#[must_use]
pub enum XRefEntry {
    /// 未使用（free）エントリ。type = 0。
    ///
    /// 削除済み、または一度も使われていないオブジェクト番号を表す。
    /// free エントリはリンクリスト（フリーリスト）を構成し、
    /// オブジェクト番号 0 が世代番号 65535 の free エントリとしてその先頭になる。
    /// この番号への間接参照の解決は null オブジェクトを返す（解決層の責務）。
    ///
    /// ただし 0 番エントリは `XRefTable` に登録しない（#334）。表のキーである
    /// `ObjectNumber` が正整数しか表せないため、読み進めたうえで登録を飛ばす。
    /// この結果フリーリストのヘッドは失われるので、リスト走査を実装する際は
    /// ヘッドの保持方法を再設計する必要がある。
    Free {
        /// フリーリスト上で次に来る空きオブジェクト番号。
        ///
        /// リストの末尾では 0（先頭へ戻る）を指すため、正整数しか表せない
        /// `ObjectNumber` ではなく [`FreeObjectNumber`] を持つ（#334）。
        ///
        /// [`FreeObjectNumber`]: crate::object::free_object_number::FreeObjectNumber
        next_free_object: FreeObjectNumber,
        /// このオブジェクト番号が再利用されるときに使われる世代番号。
        ///
        /// 削除のたびに 1 加算される。フリーリスト先頭（オブジェクト番号 0）では 65535。
        generation: GenerationNumber,
    },
    /// 使用中（in-use）エントリ。type = 1。
    ///
    /// 通常の間接オブジェクトを表す。`offset` の位置に `N G obj ... endobj` がある。
    InUse {
        /// ファイル先頭から数えた、間接オブジェクト定義の開始バイト位置。
        ///
        /// ヘッダがファイル先頭にない PDF では実位置との補正が要るが、
        /// ここには xref に記録された値をそのまま保持する。
        offset: ByteOffset,
        /// この間接オブジェクトの世代番号。
        ///
        /// 間接参照 `N G R` の `G` と照合する用途を想定する（照合は解決層の責務）。
        generation: GenerationNumber,
    },
    /// オブジェクトストリーム内エントリ。type = 2（仕様上の呼称は compressed entry）。
    ///
    /// オブジェクトストリーム（`/Type /ObjStm`）の中に格納されたオブジェクトを表す。
    /// ISO 32000-1 §7.5.8.3 はこれを「compressed object」と呼ぶが、`/FlateDecode` による
    /// ストリーム圧縮とは無関係（親 ObjStm が圧縮されているかどうかは問わない）ため、
    /// 混同を避けてバリアント名は `InObjectStream` とする。
    /// 圧縮オブジェクトの世代番号は常に 0 と定められているため
    /// （`docs/specs/02a_object_resolution.md` §2.3）、世代番号フィールドを持たない。
    InObjectStream {
        /// このオブジェクトを格納している親オブジェクトストリームのオブジェクト番号。
        stream_object: ObjectNumber,
        /// 親オブジェクトストリーム内での 0 起点のインデックス。
        ///
        /// 親ストリームの `/N`（格納オブジェクト数）未満の値を想定するが、
        /// 範囲の検証は解析・解決層の責務であり、ここでは無検証で保持する。
        index_in_stream: u32,
    },
}

#[cfg(test)]
mod tests;
