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
                    cursor = result.scan_object(input, offset, source)?.unwrap_or(cursor);
                }
                Token::Keyword(Keyword::Xref) => result.scan_xref_table(input, offset),
                Token::Keyword(Keyword::Trailer) => cursor = result.scan_trailer(input, offset)?,
                // Length が未検証のストリーム内部では obj を安全に探索できない。
                Token::StreamBegin => return Err(ResolveError::RecoveryFailed),
                _ => {}
            }
        }
        Ok(result)
    }

    // 間接オブジェクトとして読めない整数トークンなら、通常の字句走査を継続する。
    fn scan_object(
        &mut self,
        input: &[u8],
        offset: ByteOffset,
        source: Option<(&PdfHeader, &XRefTable)>,
    ) -> Result<Option<usize>, ResolveError> {
        let position = usize::try_from(offset.value()).map_err(|_| ResolveError::RecoveryFailed)?;
        let mut parser = Parser::new_at(input, position);
        let Ok(object) = parser.parse_indirect_object_with_length(|reference, _| {
            Self::resolve_length(input, reference, source)
        }) else {
            return Ok(None);
        };
        let next =
            usize::try_from(parser.position().value()).map_err(|_| ResolveError::RecoveryFailed)?;
        self.scan_xref_stream(input, offset, object.object())?;
        self.objects
            .insert(object.id().object_number(), (object.id(), offset));
        Ok(Some(next))
    }

    fn scan_xref_stream(
        &mut self,
        input: &[u8],
        offset: ByteOffset,
        object: &PdfObject,
    ) -> Result<(), ResolveError> {
        let PdfObject::Stream(stream) = object else {
            return Ok(());
        };
        let Some(PdfObject::Name(name)) = stream.dictionary().get(b"Type".as_slice()) else {
            return Ok(());
        };
        if name.as_bytes() != b"XRef" {
            return Ok(());
        }

        let (entries, trailer, _) = ParsedXRefStream::parse(input, offset)
            .map_err(|_| ResolveError::RecoveryFailed)?
            .into_parts();
        self.merge_section(entries);
        let Some(trailer) = trailer else {
            return Ok(());
        };
        self.trailer = Some(trailer);
        self.last_xref = Some(offset);
        Ok(())
    }

    fn scan_xref_table(&mut self, input: &[u8], offset: ByteOffset) {
        self.last_xref = Some(offset);
        let Ok(section) = ParsedXRefTable::parse(input, offset) else {
            return;
        };
        self.merge_section(section.into_table());
    }

    fn scan_trailer(&mut self, input: &[u8], offset: ByteOffset) -> Result<usize, ResolveError> {
        let parsed =
            ParsedTrailer::parse(input, offset).map_err(|_| ResolveError::RecoveryFailed)?;
        let next =
            usize::try_from(parsed.end().value()).map_err(|_| ResolveError::RecoveryFailed)?;
        let trailer = parsed.into_trailer();
        if let Some(supplement) = trailer.xref_stm() {
            self.scan_supplement(input, supplement)?;
        }
        self.trailer = Some(trailer);
        Ok(next)
    }

    fn scan_supplement(&mut self, input: &[u8], recorded: ByteOffset) -> Result<(), ResolveError> {
        let header = PdfHeader::parse(input).map_err(ResolveError::File)?;
        let actual = header
            .resolve_offset(recorded)
            .ok_or(ResolveError::RecoveryFailed)?;
        let entries = ParsedXRefStream::parse(input, actual)
            .map_err(|_| ResolveError::RecoveryFailed)?
            .into_table();
        self.merge_section(entries);
        Ok(())
    }

    // 前方から走査するため、後で読んだセクションを既存エントリより優先する。
    fn merge_section(&mut self, mut entries: XRefTable) {
        entries.merge_older(std::mem::take(&mut self.sections));
        self.sections = entries;
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
