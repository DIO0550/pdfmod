//! トレイラの Info を解決し、項目ごとの情報辞書解析結果を返す。

use super::ObjectResolver;
use crate::document_info::{
    error::{DocumentInfoError, DocumentInfoErrorKind},
    DocumentInfo,
};

impl ObjectResolver<'_> {
    /// Info が不在・Null なら空の結果を返す。各項目の不正は結果内に保持する。
    /// トレイラ不在・辞書の解決失敗・辞書以外の値は位置付きの Err。
    pub fn document_info(&mut self) -> Result<DocumentInfo, DocumentInfoError> {
        let trailer = self.trailer.as_ref().ok_or_else(|| {
            DocumentInfoError::new(DocumentInfoErrorKind::MissingTrailer, self.header.origin())
        })?;
        let Some(reference) = trailer.info() else {
            return Ok(DocumentInfo::default());
        };
        let position = trailer.position();
        let object = self.resolve(reference).map_err(|error| {
            DocumentInfoError::new(DocumentInfoErrorKind::Resolution(error), position)
        })?;
        DocumentInfo::from_object(object, position, self)
    }
}
