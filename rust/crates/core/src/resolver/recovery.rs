//! 破損xrefの明示的な回復。通常の読み込みが成功した場合は走査しない。
mod index;

use super::{error::ResolveError, ObjectResolver};
use crate::byte_offset::ByteOffset;
use crate::error::{PdfError, PdfErrorCode};
use crate::file::header::PdfHeader;
use crate::lexer::{LexOutcome, Lexer};
use crate::object::object_id::ObjectId;
use crate::parser::Parser;
use crate::xref::chain::XRefChain;
use index::RecoveryIndex;
use std::collections::HashMap;

/// オフセットを再発見した方法。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RecoveryMethod {
    /// ±32バイト内で発見し、ファイル先頭から字句境界を検証した。
    Nearby,
    /// ファイル全体の走査で発見した。
    FullScan,
}

/// 回復に成功した際の記録。暗黙に破損を握りつぶさない。
#[derive(Debug, PartialEq, Eq)]
pub enum RecoveryWarning {
    /// 壊れた末尾情報またはxrefチェーンを走査で回復した。
    RebuiltXRef,
    /// 元の位置にないオブジェクトを再発見した。
    RecoveredOffset {
        /// 対象オブジェクト。
        object: ObjectId,
        /// xrefの元の記録値。
        recorded: ByteOffset,
        /// 原点補正済みの実位置。
        actual: ByteOffset,
        /// 探索方法。
        method: RecoveryMethod,
    },
}

#[derive(Debug, Default)]
pub(super) struct RecoveryState {
    index: Option<RecoveryIndex>,
    offsets: HashMap<ObjectId, ByteOffset>,
    warnings: Vec<RecoveryWarning>,
}

impl<'a> ObjectResolver<'a> {
    /// 寛容モードで開く。壊れた末尾情報は走査で回復し、警告に残す。
    /// 有効なトレイラがない場合、暗号化、回復不能な構文では `PdfError` を返す。
    pub fn open_recovering(input: &'a [u8]) -> Result<Self, PdfError> {
        Self::open_with_recovery(input).map_err(Into::into)
    }

    fn open_with_recovery(input: &'a [u8]) -> Result<Self, ResolveError> {
        match Self::open(input) {
            Ok(mut resolver) => {
                resolver.enable_recovery();
                return Ok(resolver);
            }
            Err(ResolveError::XRef(_)) => {}
            Err(error) => return Err(error),
        }
        let header = PdfHeader::parse(input).map_err(ResolveError::File)?;
        if let Some(chain) = Self::recover_tail_chain(input, &header) {
            let (table, trailer) = chain.into_parts();
            if trailer.encrypt().is_some() {
                return Err(ResolveError::EncryptedDocument);
            }
            let mut resolver = Self::new(input, header, table);
            resolver.trailer = Some(trailer);
            resolver.recovery = Some(RecoveryState {
                warnings: vec![RecoveryWarning::RebuiltXRef],
                ..RecoveryState::default()
            });
            return Ok(resolver);
        }
        let mut index = RecoveryIndex::scan(input, input.len(), None)?;
        let mut trailer = index.trailer.take().ok_or(ResolveError::RecoveryFailed)?;
        if trailer.encrypt().is_some() {
            return Err(ResolveError::EncryptedDocument);
        }
        // A damaged EOF must not discard a still-readable xref's free/compressed entries.
        let original = index.last_xref.and_then(|offset| {
            offset
                .value()
                .checked_sub(header.origin().value())
                .and_then(|relative| {
                    XRefChain::parse_at(input, &header, ByteOffset::new(relative), 100).ok()
                })
        });
        let mut table = index.table(&header)?;
        if let Some(chain) = original {
            let (mut original, latest) = chain.into_parts();
            if latest.encrypt().is_some() {
                return Err(ResolveError::EncryptedDocument);
            }
            original.merge_older(table);
            table = original;
            trailer = latest;
        }
        if table.is_empty() {
            return Err(ResolveError::RecoveryFailed);
        }
        let mut resolver = Self::new(input, header, table);
        resolver.trailer = Some(trailer);
        resolver.recovery = Some(RecoveryState {
            index: Some(index),
            offsets: HashMap::new(),
            warnings: vec![RecoveryWarning::RebuiltXRef],
        });
        Ok(resolver)
    }

    // Restrict tail repair to the final section, never roll back to an older valid revision.
    fn recover_tail_chain(input: &[u8], header: &PdfHeader) -> Option<XRefChain> {
        use crate::lexer::{
            byte_kind::ByteKind,
            byte_ops::keyword_end_at,
            token::{Keyword, Primitive, Token},
        };
        let start = input.len().saturating_sub(1024);
        let mut latest = None;
        for position in start..input.len() {
            if position > 0
                && !input
                    .get(position.saturating_sub(1))
                    .is_some_and(|b| ByteKind::is_token_boundary(*b))
            {
                continue;
            }
            if keyword_end_at(input, position, Keyword::Xref.as_bytes()).is_some() {
                latest = Some(position);
            }
        }
        if let Some(position) = latest {
            // The trailer parser validates the candidate; a prefix scan validates lexical context
            // using its xref to resolve indirect stream lengths.
            let relative = u64::try_from(position)
                .ok()?
                .checked_sub(header.origin().value())?;
            let chain = XRefChain::parse_at(input, header, ByteOffset::new(relative), 100).ok()?;
            let index =
                RecoveryIndex::scan(input, input.len(), Some((header, chain.table()))).ok()?;
            if index.last_xref == Some(ByteOffset::new(u64::try_from(position).ok()?)) {
                return Some(chain);
            }
            return None;
        }
        // Stream-only PDFs have no bare xref token, but startxref may still be intact.
        let position = (start..input.len()).rev().find(|position| {
            keyword_end_at(input, *position, Keyword::StartXref.as_bytes()).is_some()
        })?;
        let after = position.checked_add(Keyword::StartXref.as_bytes().len())?;
        let mut lexer = Lexer::new_at(input, after);
        let LexOutcome::Lexed(Token::Primitive(Primitive::Integer(value))) = lexer.take_token()
        else {
            return None;
        };
        let recorded = ByteOffset::new(u64::try_from(value).ok()?);
        let chain = XRefChain::parse_at(input, header, recorded, 100).ok()?;
        let index = RecoveryIndex::scan(input, input.len(), Some((header, chain.table()))).ok()?;
        if index.last_xref == header.resolve_offset(recorded) {
            return Some(chain);
        }
        None
    }

    /// 位置不一致の回復を有効にする。既存キャッシュと回復履歴は保持する。
    pub fn enable_recovery(&mut self) {
        if self.recovery.is_none() {
            self.recovery = Some(RecoveryState::default());
        }
    }

    /// 回復警告を返す。厳密モードと、正常ファイルを開いただけの場合は空。
    pub fn recovery_warnings(&self) -> &[RecoveryWarning] {
        self.recovery
            .as_ref()
            .map(|state| state.warnings.as_slice())
            .unwrap_or(&[])
    }

    /// 解決エラーを共通の `PdfError` として受け取りたい場合の入口。
    pub fn resolve_pdf(
        &mut self,
        reference: crate::object::indirect_ref::IndirectRef,
    ) -> Result<std::rc::Rc<crate::object::pdf_object::PdfObject>, PdfError> {
        self.resolve(reference).map_err(Into::into)
    }

    pub(super) fn locate(
        &mut self,
        id: ObjectId,
        recorded: ByteOffset,
    ) -> Result<ByteOffset, ResolveError> {
        if let Some(offset) = self
            .recovery
            .as_ref()
            .and_then(|state| state.offsets.get(&id))
            .copied()
        {
            return Ok(offset);
        }
        let normal = self.actual_offset(recorded).and_then(|offset| {
            Self::check_header(self.input, id, offset)?;
            Ok(offset)
        });
        let error = match normal {
            Ok(offset) => return Ok(offset),
            Err(error) => error,
        };
        if self.recovery.is_none() {
            return Err(error);
        }
        let nearby = self
            .header
            .resolve_offset(recorded)
            .and_then(|offset| self.find_nearby(id, offset));
        let (actual, method) = match nearby {
            Some(offset) => (offset, RecoveryMethod::Nearby),
            None => {
                let state = self.recovery.as_mut().ok_or(ResolveError::RecoveryFailed)?;
                if state.index.is_none() {
                    state.index = Some(RecoveryIndex::scan(
                        self.input,
                        self.input.len(),
                        Some((&self.header, &self.table)),
                    )?);
                }
                let actual = state
                    .index
                    .as_ref()
                    .and_then(|index| index.offset(id))
                    .ok_or(ResolveError::RecoveryFailed)?;
                (actual, RecoveryMethod::FullScan)
            }
        };
        if let Some(state) = self.recovery.as_mut() {
            state.offsets.insert(id, actual);
            state.warnings.push(RecoveryWarning::RecoveredOffset {
                object: id,
                recorded,
                actual,
                method,
            });
        }
        Ok(actual)
    }

    fn find_nearby(&self, id: ObjectId, offset: ByteOffset) -> Option<ByteOffset> {
        let center = usize::try_from(offset.value()).ok()?;
        let start = center.saturating_sub(32);
        let end = center
            .saturating_add(32)
            .min(self.input.len().saturating_sub(1));
        let mut candidates = Vec::new();
        for position in start..=end {
            let actual = ByteOffset::new(u64::try_from(position).ok()?);
            if Self::check_header(self.input, id, actual).is_ok() {
                candidates.push(position);
            }
        }
        candidates
            .sort_by_key(|position| (position.abs_diff(center), std::cmp::Reverse(*position)));
        for position in candidates {
            // Reject fake headers in comments, strings and stream payloads. A bounded prefix
            // walk supplies lexical context without scanning the rest of the file.
            let index =
                RecoveryIndex::scan(self.input, position, Some((&self.header, &self.table)))
                    .ok()?;
            let actual = ByteOffset::new(u64::try_from(position).ok()?);
            if index.offset(id) == Some(actual) {
                return Some(actual);
            }
        }
        None
    }

    fn check_header(input: &[u8], id: ObjectId, offset: ByteOffset) -> Result<(), ResolveError> {
        let index =
            usize::try_from(offset.value()).map_err(|_| ResolveError::InvalidOffset(offset))?;
        if index > 0
            && input
                .get(index.saturating_sub(1))
                .is_some_and(|b| !crate::lexer::byte_kind::ByteKind::is_token_boundary(*b))
        {
            return Err(ResolveError::InvalidOffset(offset));
        }
        let mut lexer = Lexer::new_at(input, index);
        if !matches!(lexer.take_token_with_pos(), LexOutcome::Lexed((_, position)) if position == index)
        {
            return Err(ResolveError::InvalidOffset(offset));
        }
        let actual = Parser::new_at(input, index)
            .parse_indirect_header()
            .map_err(ResolveError::Parse)?;
        if actual != id {
            return Err(ResolveError::ObjectMismatch {
                expected: id,
                actual,
            });
        }
        Ok(())
    }
}

impl From<ResolveError> for PdfError {
    fn from(error: ResolveError) -> Self {
        Self::new(PdfErrorCode::ObjectResolutionFailed).with_message(format!("{error:?}"))
    }
}
