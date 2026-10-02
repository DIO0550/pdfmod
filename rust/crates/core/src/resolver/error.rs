//! 遅延解決の原因と型付きオブジェクトIDを保持するエラー。
use crate::{
    byte_offset::ByteOffset,
    file::error::FileError,
    object::{generation_number::GenerationNumber, object_id::ObjectId},
    object_stream::error::ObjectStreamError,
    parser::error::ParseError,
    xref::chain::error::XRefChainError,
};

/// 世代・ヘッダ不一致と下位解析の失敗を区別する。
#[derive(Debug, PartialEq)]
pub enum ResolveError {
    /// 再入したオブジェクトを末尾にも含む循環経路。
    Cycle(Vec<ObjectId>),
    /// 循環ではないが参照深さが上限を超えた。
    TooDeep {
        /// 許容する深さ。
        limit: usize,
        /// 上限を超えたID。
        object: ObjectId,
    },
    /// 間接Lengthが非負のメモリサイズにならない。
    InvalidLength {
        /// Lengthの参照先。
        object: ObjectId,
        /// ストリーム辞書の位置。
        position: ByteOffset,
    },
    /// ヘッダが不正。
    File(FileError),
    /// xrefチェーンが不正。
    XRef(XRefChainError),
    /// 間接オブジェクトの構文が不正。
    Parse(ParseError),
    /// ObjStmの構造・復号・インデックスが不正。
    ObjectStream(ObjectStreamError),
    /// 記録オフセットの補正に失敗、または入力範囲外。
    InvalidOffset(ByteOffset),
    /// xrefの世代が要求と一致しない。
    GenerationMismatch {
        /// 要求されたID。
        requested: ObjectId,
        /// xrefに記録された世代。
        actual: GenerationNumber,
    },
    /// オブジェクトヘッダ・ObjStmの格納番号が要求と一致しない。
    ObjectMismatch {
        /// 要求されたID。
        expected: ObjectId,
        /// 実際に読み込んだID。
        actual: ObjectId,
    },
    /// 親がInUseのストリームでない。
    InvalidObjectStream(ObjectId),
    /// 復号に対応していないため暗号化ファイルは開けない。
    EncryptedDocument,
}

impl From<ParseError> for ResolveError {
    fn from(error: ParseError) -> Self {
        Self::Parse(error)
    }
}
