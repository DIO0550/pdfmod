//! 正常に読めるオブジェクトの境界だけを採用する回復用索引。
use crate::byte_offset::ByteOffset;
use crate::file::header::PdfHeader;
use crate::lexer::{
    token::{Keyword, Primitive, Token},
    LexOutcome, Lexer,
};
use crate::object::indirect_ref::IndirectRef;
use crate::object::{object_id::ObjectId, object_number::ObjectNumber, pdf_object::PdfObject};
use crate::parser::Parser;
use crate::resolver::error::ResolveError;
use crate::xref::{
    entry::XRefEntry,
    stream::ParsedXRefStream,
    table::{parse::ParsedXRefTable, XRefTable},
    trailer::{parse::ParsedTrailer, Trailer},
};
use std::collections::HashMap;

#[derive(Debug, Default)]
pub(super) struct RecoveryIndex {
    objects: HashMap<ObjectNumber, (ObjectId, ByteOffset)>,
    sections: XRefTable,
    pub(super) trailer: Option<Trailer>,
    pub(super) last_xref: Option<ByteOffset>,
}

impl RecoveryIndex {
    pub(super) fn scan(
        input: &[u8],
        end: usize,
        source: Option<(&PdfHeader, &XRefTable)>,
    ) -> Result<Self, ResolveError> {
        let mut result = Self::default();
        let mut cursor = 0usize;
        while cursor <= end && cursor < input.len() {
            let mut lexer = Lexer::new_at(input, cursor);
            let (token, position) = match lexer.take_token_with_pos() {
                LexOutcome::Lexed(pair) => pair,
                LexOutcome::Eof => break,
                LexOutcome::Malformed { .. } => return Err(ResolveError::RecoveryFailed),
            };
            if position > end {
                break;
            }
            cursor = lexer.cursor_position().max(cursor.saturating_add(1));
            let offset =
                ByteOffset::new(u64::try_from(position).map_err(|_| ResolveError::RecoveryFailed)?);
            match token {
                Token::Primitive(Primitive::Integer(_)) => {
                    let mut parser = Parser::new_at(input, position);
                    if let Ok(object) = parser.parse_indirect_object_with_length(|reference, _| {
                        Self::resolve_length(input, reference, source)
                    }) {
                        let next = usize::try_from(parser.position().value())
                            .map_err(|_| ResolveError::RecoveryFailed)?;
                        if let PdfObject::Stream(stream) = object.object() {
                            if matches!(stream.dictionary().get(b"Type".as_slice()), Some(PdfObject::Name(name)) if name.as_bytes() == b"XRef")
                            {
                                let (mut entries, trailer, _) =
                                    ParsedXRefStream::parse(input, offset)
                                        .map_err(|_| ResolveError::RecoveryFailed)?
                                        .into_parts();
                                entries.merge_older(std::mem::take(&mut result.sections));
                                result.sections = entries;
                                if let Some(trailer) = trailer {
                                    result.trailer = Some(trailer);
                                    result.last_xref = Some(offset);
                                }
                            }
                        }
                        result
                            .objects
                            .insert(object.id().object_number(), (object.id(), offset));
                        cursor = next;
                    }
                }
                Token::Keyword(Keyword::Xref) => {
                    result.last_xref = Some(offset);
                    if let Ok(section) = ParsedXRefTable::parse(input, offset) {
                        let mut entries = section.into_table();
                        entries.merge_older(std::mem::take(&mut result.sections));
                        result.sections = entries;
                    }
                }
                Token::Keyword(Keyword::Trailer) => {
                    let trailer = ParsedTrailer::parse(input, offset)
                        .map_err(|_| ResolveError::RecoveryFailed)?;
                    cursor = usize::try_from(trailer.end().value())
                        .map_err(|_| ResolveError::RecoveryFailed)?;
                    let trailer = trailer.into_trailer();
                    if let Some(supplement) = trailer.xref_stm() {
                        let header = PdfHeader::parse(input).map_err(ResolveError::File)?;
                        let actual = header
                            .resolve_offset(supplement)
                            .ok_or(ResolveError::RecoveryFailed)?;
                        let mut entries = ParsedXRefStream::parse(input, actual)
                            .map_err(|_| ResolveError::RecoveryFailed)?
                            .into_table();
                        entries.merge_older(std::mem::take(&mut result.sections));
                        result.sections = entries;
                    }
                    result.trailer = Some(trailer);
                }
                // Without a validated Length the payload cannot safely be searched for obj.
                Token::StreamBegin => return Err(ResolveError::RecoveryFailed),
                _ => {}
            }
        }
        Ok(result)
    }

    fn resolve_length(
        input: &[u8],
        reference: IndirectRef,
        source: Option<(&PdfHeader, &XRefTable)>,
    ) -> Result<usize, ResolveError> {
        let (header, table) = source.ok_or(ResolveError::RecoveryFailed)?;
        let mut id = reference.target();
        let mut visited = std::collections::HashSet::new();
        for _ in 0..100 {
            if !visited.insert(id) {
                return Err(ResolveError::RecoveryFailed);
            }
            let Some(XRefEntry::InUse { offset, generation }) = table.get(id.object_number())
            else {
                return Err(ResolveError::RecoveryFailed);
            };
            if *generation != id.generation_number() {
                return Err(ResolveError::RecoveryFailed);
            }
            let offset = header
                .resolve_offset(*offset)
                .ok_or(ResolveError::RecoveryFailed)?;
            super::ObjectResolver::check_header(input, id, offset)?;
            let position =
                usize::try_from(offset.value()).map_err(|_| ResolveError::RecoveryFailed)?;
            let (_, object) = Parser::new_at(input, position)
                .parse_indirect_object()
                .map_err(ResolveError::Parse)?
                .into_parts();
            match object {
                PdfObject::Integer(length) => {
                    return usize::try_from(length.value())
                        .map_err(|_| ResolveError::RecoveryFailed)
                }
                PdfObject::Reference(next) => id = next.target(),
                _ => return Err(ResolveError::RecoveryFailed),
            }
        }
        Err(ResolveError::RecoveryFailed)
    }

    pub(super) fn offset(&self, id: ObjectId) -> Option<ByteOffset> {
        self.objects
            .get(&id.object_number())
            .filter(|(actual, _)| *actual == id)
            .map(|(_, offset)| *offset)
    }

    pub(super) fn table(&mut self, header: &PdfHeader) -> Result<XRefTable, ResolveError> {
        let mut table = XRefTable::new();
        for (number, (id, offset)) in &self.objects {
            let relative = offset
                .value()
                .checked_sub(header.origin().value())
                .ok_or(ResolveError::RecoveryFailed)?;
            table.insert(
                *number,
                XRefEntry::InUse {
                    offset: ByteOffset::new(relative),
                    generation: id.generation_number(),
                },
            );
        }
        let mut original = std::mem::take(&mut self.sections);
        original.merge_older(table);
        Ok(original)
    }
}
