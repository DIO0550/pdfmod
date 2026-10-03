//! xref を利用した間接オブジェクトの遅延読み込み（ISO 32000-1 §7.3.10, §7.5）。

pub mod error;

use crate::byte_offset::ByteOffset;
use crate::file::header::PdfHeader;
use crate::object::{
    generation_number::GenerationNumber, indirect_ref::IndirectRef, object_id::ObjectId,
    pdf_object::PdfObject,
};
use crate::object_stream::ObjectStream;
use crate::parser::Parser;
use crate::xref::{chain::XRefChain, entry::XRefEntry, table::XRefTable, trailer::Trailer};
use error::ResolveError;
use std::rc::Rc;

/// 入力を借用し、要求されたオブジェクトだけを解析する。
/// 配列・辞書内の参照は保持する。返す `Rc` は呼び出し側と所有を共有する。
#[derive(Debug)]
pub struct ObjectResolver<'a> {
    input: &'a [u8],
    header: PdfHeader,
    table: XRefTable,
    trailer: Option<Trailer>,
}

impl<'a> ObjectResolver<'a> {
    /// ヘッダとxrefを解析する。オブジェクト本体は要求されるまで読み込まない。
    /// ファイル構造が不正、または暗号化されていればエラーを返す。
    pub fn open(input: &'a [u8]) -> Result<Self, ResolveError> {
        let header = PdfHeader::parse(input).map_err(ResolveError::File)?;
        let (table, trailer) = XRefChain::parse(input, &header)
            .map_err(ResolveError::XRef)?
            .into_parts();
        if trailer.encrypt().is_some() {
            return Err(ResolveError::EncryptedDocument);
        }
        Ok(Self {
            input,
            header,
            table,
            trailer: Some(trailer),
        })
    }

    /// 検証済みの非暗号化ファイルのヘッダとxrefから構築する。
    /// エントリの位置・世代は解決時に検証する。トレイラは保持しない。
    pub fn new(input: &'a [u8], header: PdfHeader, table: XRefTable) -> Self {
        Self {
            input,
            header,
            table,
            trailer: None,
        }
    }

    /// ファイルを開いた際のトレイラ。`new` で構築した場合は `None`。
    pub fn trailer(&self) -> Option<&Trailer> {
        self.trailer.as_ref()
    }

    /// 参照先を1段読み込む。未登録・freeはnull、番号・世代・構文不正はエラー。
    pub fn resolve(&mut self, reference: IndirectRef) -> Result<Rc<PdfObject>, ResolveError> {
        self.load(reference.target()).map(Rc::new)
    }

    /// 直値をそのまま返し、間接参照なら解決する。
    pub fn resolve_value(&mut self, value: PdfObject) -> Result<Rc<PdfObject>, ResolveError> {
        match value {
            PdfObject::Reference(reference) => self.resolve(reference),
            direct => Ok(Rc::new(direct)),
        }
    }

    fn load(&mut self, id: ObjectId) -> Result<PdfObject, ResolveError> {
        let Some(entry) = self.table.get(id.object_number()).copied() else {
            return Ok(PdfObject::Null);
        };
        match entry {
            XRefEntry::Free { .. } => Ok(PdfObject::Null),
            XRefEntry::InUse { offset, generation } => {
                Self::check_generation(id, generation)?;
                self.read_indirect(id, offset)
            }
            XRefEntry::InObjectStream {
                stream_object,
                index_in_stream,
            } => {
                Self::check_generation(id, GenerationNumber::new(0))?;
                let Some(XRefEntry::InUse { offset, generation }) =
                    self.table.get(stream_object).copied()
                else {
                    return Err(ResolveError::InvalidObjectStream(id));
                };
                let parent = ObjectId::new(stream_object, generation);
                let body = self.read_indirect(parent, offset)?;
                let PdfObject::Stream(stream) = body else {
                    return Err(ResolveError::InvalidObjectStream(parent));
                };
                let stream = ObjectStream::from_stream(stream, self.actual_offset(offset)?)
                    .map_err(ResolveError::ObjectStream)?;
                let index = usize::try_from(index_in_stream)
                    .map_err(|_| ResolveError::InvalidObjectStream(id))?;
                let (actual, object) = stream
                    .get_object(index)
                    .map_err(ResolveError::ObjectStream)?;
                if actual != id {
                    return Err(ResolveError::ObjectMismatch {
                        expected: id,
                        actual,
                    });
                }
                Ok(object)
            }
        }
    }

    fn check_generation(id: ObjectId, actual: GenerationNumber) -> Result<(), ResolveError> {
        if id.generation_number() != actual {
            return Err(ResolveError::GenerationMismatch {
                requested: id,
                actual,
            });
        }
        Ok(())
    }

    fn actual_offset(&self, recorded: ByteOffset) -> Result<ByteOffset, ResolveError> {
        let actual = self
            .header
            .resolve_offset(recorded)
            .ok_or(ResolveError::InvalidOffset(recorded))?;
        let index =
            usize::try_from(actual.value()).map_err(|_| ResolveError::InvalidOffset(recorded))?;
        if index >= self.input.len() {
            return Err(ResolveError::InvalidOffset(recorded));
        }
        Ok(actual)
    }

    fn read_indirect(
        &mut self,
        id: ObjectId,
        recorded: ByteOffset,
    ) -> Result<PdfObject, ResolveError> {
        let offset = self.actual_offset(recorded)?;
        let index =
            usize::try_from(offset.value()).map_err(|_| ResolveError::InvalidOffset(recorded))?;
        let mut parser = Parser::new_at(self.input, index);
        let (actual, body) = parser
            .parse_indirect_object()
            .map_err(ResolveError::Parse)?
            .into_parts();
        if actual != id {
            return Err(ResolveError::ObjectMismatch {
                expected: id,
                actual,
            });
        }
        Ok(body)
    }
}

#[cfg(test)]
mod tests;
