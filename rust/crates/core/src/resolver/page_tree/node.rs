//! 借用したノード辞書の検証とエントリの参照解決。

use std::rc::Rc;

use crate::object::{
    dictionary::PdfDictionary, indirect_ref::IndirectRef, object_id::ObjectId,
    pdf_object::PdfObject,
};
use crate::page_tree::{
    error::{PageTreeError, PageTreeKey},
    warning::{PageNodeKind, PageTreeWarning},
};
use crate::resolver::ObjectResolver;

pub(super) struct PageNode<'a> {
    node: ObjectId,
    dictionary: &'a PdfDictionary,
}

enum Value<'a> {
    Direct(&'a PdfObject),
    Resolved(Rc<PdfObject>),
}

impl Value<'_> {
    fn object(&self) -> &PdfObject {
        match self {
            Self::Direct(object) => object,
            Self::Resolved(object) => object,
        }
    }
}

impl<'a> PageNode<'a> {
    pub(super) fn new(node: ObjectId, object: &'a PdfObject) -> Result<Self, PageTreeError> {
        let PdfObject::Dictionary(dictionary) = object else {
            return Err(PageTreeError::NotADictionary {
                node,
                actual: object.kind(),
            });
        };
        Ok(Self { node, dictionary })
    }

    fn entry(
        &self,
        key: PageTreeKey,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<Option<Value<'_>>, PageTreeError> {
        match self.dictionary.get(key.as_bytes()) {
            None | Some(PdfObject::Null) => Ok(None),
            Some(PdfObject::Reference(reference)) => {
                let object =
                    resolver
                        .resolve(*reference)
                        .map_err(|cause| PageTreeError::Resolution {
                            node: self.node,
                            key: Some(key),
                            cause,
                        })?;
                if matches!(object.as_ref(), PdfObject::Null) {
                    return Ok(None);
                }
                Ok(Some(Value::Resolved(object)))
            }
            Some(object) => Ok(Some(Value::Direct(object))),
        }
    }

    pub(super) fn kind(
        &self,
        resolver: &mut ObjectResolver<'_>,
        warnings: &mut Vec<PageTreeWarning>,
    ) -> Result<PageNodeKind, PageTreeError> {
        let Some(value) = self.entry(PageTreeKey::Type, resolver)? else {
            return self.infer_kind(resolver, warnings);
        };
        let PdfObject::Name(name) = value.object() else {
            return Err(self.invalid_type(PageTreeKey::Type, value.object()));
        };
        match name.as_bytes() {
            b"Pages" => Ok(PageNodeKind::Pages),
            b"Page" => Ok(PageNodeKind::Page),
            _ => Err(PageTreeError::InvalidType { node: self.node }),
        }
    }

    fn infer_kind(
        &self,
        resolver: &mut ObjectResolver<'_>,
        warnings: &mut Vec<PageTreeWarning>,
    ) -> Result<PageNodeKind, PageTreeError> {
        let inferred = match self.entry(PageTreeKey::Kids, resolver)? {
            Some(_) => PageNodeKind::Pages,
            None => {
                if !matches!(
                    self.dictionary.get(b"Parent".as_slice()),
                    Some(PdfObject::Reference(_))
                ) {
                    return Err(PageTreeError::CannotInferType { node: self.node });
                }
                PageNodeKind::Page
            }
        };
        warnings.push(PageTreeWarning::InferredType {
            node: self.node,
            inferred,
        });
        Ok(inferred)
    }

    pub(super) fn kids(
        &self,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<Vec<IndirectRef>, PageTreeError> {
        let value = self
            .entry(PageTreeKey::Kids, resolver)?
            .ok_or(PageTreeError::MissingKids { node: self.node })?;
        let PdfObject::Array(kids) = value.object() else {
            return Err(self.invalid_type(PageTreeKey::Kids, value.object()));
        };
        kids.iter()
            .enumerate()
            .map(|(index, kid)| match kid {
                PdfObject::Reference(reference) => Ok(*reference),
                _ => Err(PageTreeError::InvalidKid {
                    node: self.node,
                    index,
                    actual: kid.kind(),
                }),
            })
            .collect()
    }

    pub(super) fn count(
        &self,
        resolver: &mut ObjectResolver<'_>,
        warnings: &mut Vec<PageTreeWarning>,
    ) -> Result<Option<u64>, PageTreeError> {
        let Some(value) = self.entry(PageTreeKey::Count, resolver)? else {
            warnings.push(PageTreeWarning::MissingCount { node: self.node });
            return Ok(None);
        };
        let count = match value.object() {
            PdfObject::Integer(count) => u64::try_from(count.value()).ok(),
            _ => None,
        };
        if count.is_some() {
            return Ok(count);
        }
        warnings.push(PageTreeWarning::InvalidCount {
            node: self.node,
            actual: value.object().kind(),
        });
        Ok(None)
    }

    fn invalid_type(&self, key: PageTreeKey, value: &PdfObject) -> PageTreeError {
        PageTreeError::InvalidKeyType {
            node: self.node,
            key,
            actual: value.kind(),
        }
    }
}
