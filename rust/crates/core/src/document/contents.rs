//! Contents を単一ストリームまたは配列として解決する。展開・結合は行わない。

use std::rc::Rc;

use super::{DocumentError, PdfDocument, PdfPage};
use crate::object::PdfObject;

impl PdfDocument<'_> {
    /// 同じ文書から取得したページの Contents を、記述順の Stream オブジェクト列にする。
    /// 不在・Null は空。単一参照・直接配列・配列への間接参照に対応する。
    /// 配列要素の型不正・解決失敗は Err。フィルタ展開・連結・描画命令解析は行わない。
    pub fn content_streams(&mut self, page: &PdfPage) -> Result<Vec<Rc<PdfObject>>, DocumentError> {
        let Some(contents) = page.contents() else {
            return Ok(Vec::new());
        };
        if let PdfObject::Reference(reference) = contents {
            let object = self.resolve(*reference)?;
            if matches!(object.as_ref(), PdfObject::Stream(_)) {
                return Ok(vec![object]);
            }
            return self.collect_contents(page, &object);
        }
        self.collect_contents(page, contents)
    }

    fn collect_contents(
        &mut self,
        page: &PdfPage,
        contents: &PdfObject,
    ) -> Result<Vec<Rc<PdfObject>>, DocumentError> {
        match contents {
            PdfObject::Null => Ok(Vec::new()),
            PdfObject::Stream(_) => Ok(vec![Rc::new(contents.clone())]),
            PdfObject::Array(array) => {
                let mut streams = Vec::new();
                for (index, entry) in array.iter().enumerate() {
                    streams.push(self.content_stream(page, index, entry)?);
                }
                Ok(streams)
            }
            other => Err(DocumentError::InvalidContents {
                page: page.reference().target(),
                index: None,
                actual: other.kind(),
            }),
        }
    }

    fn content_stream(
        &mut self,
        page: &PdfPage,
        index: usize,
        entry: &PdfObject,
    ) -> Result<Rc<PdfObject>, DocumentError> {
        let object = match entry {
            PdfObject::Reference(reference) => self.resolve(*reference)?,
            PdfObject::Stream(_) => return Ok(Rc::new(entry.clone())),
            other => return Err(Self::invalid_content_element(page, index, other)),
        };
        if !matches!(object.as_ref(), PdfObject::Stream(_)) {
            return Err(Self::invalid_content_element(page, index, &object));
        }
        Ok(object)
    }

    fn invalid_content_element(page: &PdfPage, index: usize, object: &PdfObject) -> DocumentError {
        DocumentError::InvalidContents {
            page: page.reference().target(),
            index: Some(index),
            actual: object.kind(),
        }
    }
}
