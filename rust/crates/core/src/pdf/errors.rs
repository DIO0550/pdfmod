//! PDF エラー型（TS 版 `packages/core/src/pdf/errors` に対応）。
//!
//! TS 版の `PdfErrorCode` 文字列 union を Rust の `enum` に移植したもの。

use super::types::{ByteOffset, ObjectId};

/// 致命的 PDF エラーコード。
///
/// パース処理での構造的・構文的問題、未実装機能、循環参照・型不一致、
/// および content-stream オペレータ関連のエラーを分類する。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PdfErrorCode {
    // --- パースエラー（TS: PdfParseErrorCode） ---
    /// ヘッダが不正。
    InvalidHeader,
    /// startxref キーワードが見つからない。
    StartxrefNotFound,
    /// xref テーブルが不正。
    XrefTableInvalid,
    /// xref ストリームが不正。
    XrefStreamInvalid,
    /// xref の /Prev チェーンに循環がある。
    XrefPrevChainCycle,
    /// xref の /Prev チェーンが深すぎる。
    XrefPrevChainTooDeep,
    /// トレーラ辞書が不正。
    TrailerDictInvalid,
    /// /Root が見つからない。
    RootNotFound,
    /// /Size が見つからない。
    SizeNotFound,
    /// /MediaBox が見つからない。
    MediaBoxNotFound,
    /// ネストが深すぎる。
    NestingTooDeep,
    /// FlateDecode に失敗。
    FlateDecodeFailed,
    /// PDF 型が不正。
    PdfTypeInvalid,
    /// 未対応のフィルタ。
    PdfFilterUnsupported,
    /// オブジェクトストリームが不正。
    ObjectStreamInvalid,
    /// オブジェクトストリームのインデックスが範囲外。
    ObjectStreamIndexOutOfRange,
    /// オブジェクトストリームのヘッダが不正。
    ObjectStreamHeaderInvalid,
    /// オブジェクトパース中に予期しないトークン。
    ObjectParseUnexpectedToken,
    /// オブジェクトが未終端。
    ObjectParseUnterminated,
    /// stream の /Length が不正。
    ObjectParseStreamLength,
    /// インライン画像が不正。
    ContentStreamInlineImageInvalid,
    /// トークナイザの位置が範囲外。
    TokenizerPositionOutOfRange,
    /// カタログの /Type が不正。
    CatalogTypeInvalid,
    /// /Pages が見つからない。
    PagesNotFound,
    /// カタログ Root が辞書でない。
    CatalogRootNotDictionary,
    /// 未実装機能。
    NotImplemented,

    // --- 追加の致命的エラー（TS: PdfErrorCode の拡張分） ---
    /// 循環参照。
    CircularReference,
    /// 型不一致。
    TypeMismatch,
    /// オペレータが二重登録された。
    OperatorAlreadyRegistered,
    /// オペレータのオペランドが不足。
    OperatorOperandMissing,
    /// オペレータのオペランド型が不一致。
    OperatorOperandTypeMismatch,
    /// オペレータのオペランド値が範囲外。
    OperatorOperandValueOutOfRange,
    /// path オペレータで current point が未確立。
    OperatorPathNoCurrentPoint,
}

/// PDF エラー。種別・メッセージと、可能なら発生位置・対象オブジェクトを保持する。
#[derive(Debug, Clone, PartialEq)]
pub struct PdfError {
    /// エラーコード。
    pub code: PdfErrorCode,
    /// 人間可読のメッセージ。
    pub message: String,
    /// 発生したファイル内オフセット（分かる場合）。
    pub offset: Option<ByteOffset>,
    /// 対象オブジェクト（分かる場合）。
    pub object_id: Option<ObjectId>,
}

impl PdfError {
    /// コードとメッセージのみからエラーを構築する。
    pub fn new(code: PdfErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            offset: None,
            object_id: None,
        }
    }
}
