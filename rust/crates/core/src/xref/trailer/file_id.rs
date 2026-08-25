//! トレイラ `/ID` のファイル識別子（ISO 32000-1:2008 §14.4、
//! `docs/specs/02_file_structure.md` §5.4）。
//!
//! `/ID` は必ず 2 要素の文字列配列で、2 つの要素は意味が異なる。
//! 第 1 要素はファイル作成時に決まり以後変わらない「永続 ID」、
//! 第 2 要素は更新のたびに再生成される「変更 ID」。
//!
//! # 位置ベースの配列にしない理由
//!
//! `[Vec<u8>; 2]` で持つと `id[0]` / `id[1]` の取り違えをコンパイラが
//! 検出できない。とくに暗号化鍵の導出は第 1 要素だけを入力に取るため
//! （ISO 32000-1 §7.6.3.3）、取り違えは「復号に失敗する」という
//! 遠く離れた症状としてしか現れない。名前付きフィールドに変えて
//! 型検査で防ぐ（#613）。
//!
//! # スコープ外
//!
//! `/ID` の生成（書き出し）、16 進表示、永続 ID と変更 ID の一致判定は
//! 本モジュールの責務ではない。必要になった時点で追加する。

use crate::object::pdf_object::PdfObject;

/// `/ID` 配列の要素数（永続 ID と変更 ID の 2 つ）。
const ELEMENT_COUNT: usize = 2;

/// トレイラ `/ID` の 2 要素ペア（ISO 32000-1:2008 §14.4）。
///
/// [`FileId::from_array`] を通してのみ構築できるため、この型を持っている
/// 時点で「厳密に 2 要素の文字列配列だった」ことが保証される。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct FileId {
    /// 第 1 要素。ファイル作成時に決まり、以後の更新でも変わらない永続 ID。
    permanent: Vec<u8>,
    /// 第 2 要素。ファイルが更新されるたびに再生成される変更 ID。
    changing: Vec<u8>,
}

impl FileId {
    /// `/ID` の配列要素から構築する。
    ///
    /// 厳密に 2 要素で、両方が [`PdfObject::String`] であることを要求する。
    /// 満たさない場合は `None`（要素数違反・非文字列要素・空配列を区別しない）。
    ///
    /// バイト列は clone せず所有権ごと取り出すため、`elements` は所有で受け取る。
    ///
    /// 空のバイト列（`<>` や `()`）は正常な値として受理する。ISO 32000-1 は
    /// `/ID` の要素長を規定しておらず（慣習的に 16 バイト）、長さ検証は行わない。
    pub fn from_array(elements: Vec<PdfObject>) -> Option<Self> {
        // 要素数の検証は固定長配列への変換に委ねる（`if len != 2` を別に書かない）。
        // 長さが合わなければ `Err(Vec<PdfObject>)` になり、`.ok()?` で None に落ちる。
        let [permanent, changing] = <[PdfObject; ELEMENT_COUNT]>::try_from(elements).ok()?;

        let (PdfObject::String(permanent), PdfObject::String(changing)) = (permanent, changing)
        else {
            return None;
        };

        Some(Self {
            permanent,
            changing,
        })
    }

    /// 第 1 要素（ファイル作成時に決まる永続 ID）を返す。
    ///
    /// ヒープ保持のため参照返し（[`PdfObject::as_string_bytes`] と同方針）。
    #[must_use]
    pub fn permanent(&self) -> &[u8] {
        &self.permanent
    }

    /// 第 2 要素（更新のたびに変わる ID）を返す。
    ///
    /// ヒープ保持のため参照返し（[`PdfObject::as_string_bytes`] と同方針）。
    #[must_use]
    pub fn changing(&self) -> &[u8] {
        &self.changing
    }
}

