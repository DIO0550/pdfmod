//! xref を利用した間接オブジェクトの遅延読み込み（ISO 32000-1 §7.3.10, §7.5）。

mod cache;
mod catalog;
mod document_info;
pub mod error;
mod page_attributes;
mod page_tree;
pub mod recovery;
use cache::ObjectCache;

use crate::byte_offset::ByteOffset;
use crate::encrypt::auth::AuthenticatedFileKey;
use crate::encrypt::object_key::{
    AuthenticatedObjectState, EncryptedValueKind, ObjectDecryptionTarget,
};
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
    authentication: Option<AuthenticatedObjectState>,
    cache: ObjectCache,
    recovery: Option<recovery::RecoveryState>,
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
            authentication: None,
            cache: ObjectCache::new(1024),
            recovery: None,
        })
    }

    /// 認証済みのファイル暗号鍵とともに暗号化PDFを開く。
    /// 対象文字列・ストリームは要求された間接オブジェクトの解決時にだけ復号する。
    ///
    /// # Errors
    ///
    /// ヘッダ・xrefの解析に失敗した場合、対応する [`ResolveError`] を返す。
    pub fn open_authenticated(
        input: &'a [u8],
        authentication: AuthenticatedFileKey<'_>,
    ) -> Result<Self, ResolveError> {
        let header = PdfHeader::parse(input).map_err(ResolveError::File)?;
        let (table, trailer) = XRefChain::parse(input, &header)
            .map_err(ResolveError::XRef)?
            .into_parts();
        Ok(Self {
            input,
            header,
            table,
            trailer: Some(trailer),
            authentication: Some(authentication.into_object_state()),
            cache: ObjectCache::new(1024),
            recovery: None,
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
            authentication: None,
            cache: ObjectCache::new(1024),
            recovery: None,
        }
    }

    /// キャッシュ上限を変更し、既存キャッシュを破棄する。既定1024件、0で無効。
    /// 件数の上限であり、バイト数や呼び出し側が保持する `Rc` は制限しない。
    pub fn set_cache_capacity(&mut self, capacity: usize) {
        self.cache = ObjectCache::new(capacity);
    }

    /// ファイルを開いた際のトレイラ。`new` で構築した場合は `None`。
    pub fn trailer(&self) -> Option<&Trailer> {
        self.trailer.as_ref()
    }

    /// 参照チェーンを辿る。循環・深さ100超過、番号・世代・構文不正はエラー。
    pub fn resolve(&mut self, reference: IndirectRef) -> Result<Rc<PdfObject>, ResolveError> {
        self.resolve_in(reference.target(), &mut Vec::new())
    }

    /// 直値をそのまま返し、間接参照なら解決する。
    pub fn resolve_value(&mut self, value: PdfObject) -> Result<Rc<PdfObject>, ResolveError> {
        match value {
            PdfObject::Reference(reference) => self.resolve(reference),
            direct => Ok(Rc::new(direct)),
        }
    }

    fn enter(id: ObjectId, active: &mut Vec<ObjectId>) -> Result<(), ResolveError> {
        if let Some(start) = active.iter().position(|seen| *seen == id) {
            let mut cycle = active.get(start..).unwrap_or(&[]).to_vec();
            cycle.push(id);
            return Err(ResolveError::Cycle(cycle));
        }
        if active.len() >= 100 {
            return Err(ResolveError::TooDeep {
                limit: 100,
                object: id,
            });
        }
        active.push(id);
        Ok(())
    }

    fn resolve_in(
        &mut self,
        id: ObjectId,
        active: &mut Vec<ObjectId>,
    ) -> Result<Rc<PdfObject>, ResolveError> {
        Self::enter(id, active)?;
        let result = self
            .load_cached(id, active)
            .and_then(|value| match value.as_ref() {
                PdfObject::Reference(next) => self.resolve_in(next.target(), active),
                _ => Ok(value),
            });
        active.pop();
        result
    }

    fn load_cached(
        &mut self,
        id: ObjectId,
        active: &mut Vec<ObjectId>,
    ) -> Result<Rc<PdfObject>, ResolveError> {
        if let Some(value) = self.cache.get(id) {
            return Ok(value);
        }
        let value = Rc::new(self.load(id, active)?);
        // キャッシュヒット時にも参照の深さを検証できるよう、参照は解決前のまま保持する。
        self.cache.insert(id, Rc::clone(&value));
        Ok(value)
    }

    fn load(
        &mut self,
        id: ObjectId,
        active: &mut Vec<ObjectId>,
    ) -> Result<PdfObject, ResolveError> {
        let Some(entry) = self.table.get(id.object_number()).copied() else {
            return Ok(PdfObject::Null);
        };
        match entry {
            XRefEntry::Free { .. } => Ok(PdfObject::Null),
            XRefEntry::InUse { offset, generation } => {
                Self::check_generation(id, generation)?;
                self.read_indirect(id, offset, active)
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
                Self::enter(parent, active)?;
                let result = self.read_indirect(parent, offset, active);
                active.pop();
                let body = result?;
                let PdfObject::Stream(stream) = body else {
                    return Err(ResolveError::InvalidObjectStream(parent));
                };
                let stream = ObjectStream::from_stream(stream, self.locate(parent, offset)?)
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
        active: &mut Vec<ObjectId>,
    ) -> Result<PdfObject, ResolveError> {
        let offset = self.locate(id, recorded)?;
        let index =
            usize::try_from(offset.value()).map_err(|_| ResolveError::InvalidOffset(recorded))?;
        let mut parser = Parser::new_at(self.input, index);
        let (actual, body) = parser
            .parse_indirect_object_with_length(|reference, position| {
                let value = self.resolve_in(reference.target(), active)?;
                match value.as_ref() {
                    PdfObject::Integer(length) => {
                        usize::try_from(length.value()).map_err(|_| ResolveError::InvalidLength {
                            object: reference.target(),
                            position,
                        })
                    }
                    _ => Err(ResolveError::InvalidLength {
                        object: reference.target(),
                        position,
                    }),
                }
            })?
            .into_parts();
        if actual != id {
            return Err(ResolveError::ObjectMismatch {
                expected: id,
                actual,
            });
        }
        self.decrypt_resolved_object(id, body)
    }

    fn decrypt_resolved_object(
        &self,
        id: ObjectId,
        object: PdfObject,
    ) -> Result<PdfObject, ResolveError> {
        let Some(trailer) = self.trailer.as_ref() else {
            return Ok(object);
        };
        if trailer.encrypt().is_none() {
            return Ok(object);
        }
        if trailer.encrypt().is_some_and(|encrypt| match encrypt {
            crate::xref::trailer::EncryptValue::Reference(reference) => reference.target() == id,
            crate::xref::trailer::EncryptValue::Dictionary(_) => false,
        }) {
            return Ok(object);
        }

        self.decrypt_object(id, object)
    }

    fn decrypt_object(&self, id: ObjectId, object: PdfObject) -> Result<PdfObject, ResolveError> {
        match object {
            PdfObject::String(string) => {
                let plaintext =
                    self.decrypt_bytes(id, EncryptedValueKind::String, string.as_bytes())?;
                Ok(PdfObject::String(crate::object::string::PdfString::new(
                    plaintext,
                    string.encoding(),
                )))
            }
            PdfObject::Array(array) => array
                .into_iter()
                .map(|value| self.decrypt_object(id, value))
                .collect::<Result<Vec<_>, _>>()
                .map(PdfObject::from),
            PdfObject::Dictionary(dictionary) => self
                .decrypt_dictionary(id, dictionary)
                .map(PdfObject::Dictionary),
            PdfObject::Stream(stream) => {
                let is_xref_stream = stream
                    .dictionary()
                    .get(b"Type".as_slice())
                    .and_then(PdfObject::as_name)
                    .is_some_and(|name| name.as_bytes() == b"XRef");
                if is_xref_stream {
                    return Ok(PdfObject::Stream(stream));
                }

                let is_metadata_stream = stream
                    .dictionary()
                    .get(b"Type".as_slice())
                    .and_then(PdfObject::as_name)
                    .is_some_and(|name| name.as_bytes() == b"Metadata");
                let metadata_is_clear =
                    self.authentication.as_ref().is_some_and(|authentication| {
                        is_metadata_stream && !authentication.decrypts_metadata()
                    });
                let (dictionary, data) = stream.into_parts();
                let mut dictionary = self.decrypt_dictionary(id, dictionary)?;
                if metadata_is_clear {
                    return Ok(PdfObject::Stream(crate::object::stream::PdfStream::new(
                        dictionary, data,
                    )));
                }

                let data = self.decrypt_bytes(id, EncryptedValueKind::Stream, data.as_slice())?;
                let length = i64::try_from(data.len()).map_err(|_| {
                    ResolveError::Decryption(
                        crate::encrypt::object_key::DecryptError::InvalidLength,
                    )
                })?;
                dictionary.insert(
                    crate::object::name::PdfName::from("Length"),
                    PdfObject::from(length),
                );
                Ok(PdfObject::Stream(crate::object::stream::PdfStream::new(
                    dictionary, data,
                )))
            }
            other => Ok(other),
        }
    }

    fn decrypt_dictionary(
        &self,
        id: ObjectId,
        dictionary: crate::object::dictionary::PdfDictionary,
    ) -> Result<crate::object::dictionary::PdfDictionary, ResolveError> {
        dictionary
            .into_iter()
            .map(|(name, value)| self.decrypt_object(id, value).map(|value| (name, value)))
            .collect()
    }

    fn decrypt_bytes(
        &self,
        id: ObjectId,
        kind: EncryptedValueKind,
        input: &[u8],
    ) -> Result<Vec<u8>, ResolveError> {
        let authentication = self
            .authentication
            .as_ref()
            .ok_or(ResolveError::Unauthenticated)?;
        let target = ObjectDecryptionTarget::Indirect { id, kind };
        let decryption = authentication
            .object_decryption(target)
            .map_err(ResolveError::IncompatibleDecryption)?;
        decryption.decrypt(input).map_err(ResolveError::Decryption)
    }
}

#[cfg(test)]
mod tests;
