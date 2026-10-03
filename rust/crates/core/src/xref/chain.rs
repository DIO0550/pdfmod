//! 新しい xref を優先する `/Prev` チェーン走査（ISO 32000-1 §7.5.6, §7.5.8.4）。

pub mod error;

use crate::byte_offset::ByteOffset;
use crate::file::{header::PdfHeader, startxref::StartXref};
use crate::lexer::{byte_ops::keyword_end_at, skip::skip_whitespace_and_comments, token::Keyword};
use crate::xref::{
    stream::ParsedXRefStream,
    table::{parse::ParsedXRefTable, XRefTable},
    trailer::{parse::ParsedTrailer, Trailer},
};
use error::XRefChainError;
use std::collections::HashSet;

/// マージ済み xref と最新セクションのトレイラ。入力バイト列は保持しない。
#[derive(Debug)]
pub struct XRefChain {
    table: XRefTable,
    trailer: Trailer,
}

impl XRefChain {
    /// `startxref` から最大100セクションを読み、原点補正して統合する。
    /// 不正なセクション、範囲外、循環、深さ超過はエラーを返す。
    pub fn parse(input: &[u8], header: &PdfHeader) -> Result<Self, XRefChainError> {
        let start = StartXref::parse(input).map_err(XRefChainError::from)?;
        Self::parse_at(input, header, start.offset(), 100)
    }

    /// 記録オフセットから指定上限まで走査する。上限0ではエラーになる。
    /// `/XRefStm` も訪問済み集合に含め、その `/Prev` は辿らない。
    pub fn parse_at(
        input: &[u8],
        header: &PdfHeader,
        start: ByteOffset,
        max_sections: usize,
    ) -> Result<Self, XRefChainError> {
        let mut visited = HashSet::new();
        let mut next = Some(start);
        let mut table = XRefTable::new();
        let mut latest = None;
        let mut count = 0usize;
        while let Some(recorded) = next {
            let offset = Self::visit(input, header, recorded, &mut visited)?;
            if count >= max_sections {
                return Err(XRefChainError::too_deep_at(offset, max_sections));
            }
            count = count.saturating_add(1);
            let (section, trailer) = Self::parse_section(input, header, offset, &mut visited)?;
            table.merge_older(section);
            next = trailer.prev();
            if latest.is_none() {
                latest = Some(trailer);
            }
        }
        Ok(Self {
            table,
            trailer: latest.ok_or(XRefChainError::missing_trailer_at(start))?,
        })
    }

    fn parse_section(
        input: &[u8],
        header: &PdfHeader,
        offset: ByteOffset,
        visited: &mut HashSet<ByteOffset>,
    ) -> Result<(XRefTable, Trailer), XRefChainError> {
        let index = usize::try_from(offset.value())
            .map_err(|_| XRefChainError::invalid_offset_at(offset, offset))?;
        let begin = skip_whitespace_and_comments(input, index, input.len());
        if keyword_end_at(input, begin, Keyword::Xref.as_bytes()).is_none() {
            let (table, trailer, _) = ParsedXRefStream::parse(input, offset)
                .map_err(XRefChainError::from)?
                .into_parts();
            let trailer = trailer.ok_or(XRefChainError::missing_trailer_at(offset))?;
            return Ok((table, trailer));
        }

        let parsed = ParsedXRefTable::parse(input, offset).map_err(XRefChainError::from)?;
        let trailer = ParsedTrailer::parse(input, parsed.end())
            .map_err(XRefChainError::from)?
            .into_trailer();
        let Some(supplement) = trailer.xref_stm() else {
            return Ok((parsed.into_table(), trailer));
        };

        let supplement = Self::visit(input, header, supplement, visited)?;
        let mut table = ParsedXRefStream::parse(input, supplement)
            .map_err(XRefChainError::from)?
            .into_table();
        // 同じ更新内では補助ストリームを優先し、その /Prev は辿らない。
        table.merge_older(parsed.into_table());
        Ok((table, trailer))
    }

    fn visit(
        input: &[u8],
        header: &PdfHeader,
        recorded: ByteOffset,
        visited: &mut HashSet<ByteOffset>,
    ) -> Result<ByteOffset, XRefChainError> {
        let offset = header
            .resolve_offset(recorded)
            .ok_or(XRefChainError::invalid_offset_at(recorded, recorded))?;
        let index = usize::try_from(offset.value())
            .map_err(|_| XRefChainError::invalid_offset_at(offset, recorded))?;
        if index >= input.len() {
            return Err(XRefChainError::invalid_offset_at(offset, recorded));
        }
        if !visited.insert(offset) {
            return Err(XRefChainError::cycle_at(offset));
        }
        Ok(offset)
    }

    /// マージ済みテーブルを借用する。
    pub fn table(&self) -> &XRefTable {
        &self.table
    }
    /// `/Root`、`/Size` と任意キーは最新セクションの値を返す。
    pub fn trailer(&self) -> &Trailer {
        &self.trailer
    }
    /// テーブルとトレイラの所有権を返す。
    pub fn into_parts(self) -> (XRefTable, Trailer) {
        (self.table, self.trailer)
    }
}

#[cfg(test)]
mod tests;
