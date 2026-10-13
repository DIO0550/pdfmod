//! Parent を根まで辿り、属性ごとに最も近い有効値を採用する。

use std::{collections::HashSet, rc::Rc};

use super::ObjectResolver;
use crate::{
    geometry::rectangle::{Rectangle, RectangleError},
    object::{IndirectRef, ObjectId, PdfArray, PdfDictionary, PdfObject},
    page_tree::{
        attributes::{
            error::{
                PageAttributeError, PageAttributeKey, PageAttributeWarning,
                PageAttributeWarningKind,
            },
            PageAttributes, PageRotation,
        },
        Page,
    },
};

enum Value<'a> {
    Direct(&'a PdfObject),
    Resolved(Rc<PdfObject>),
}

impl<'a> Value<'a> {
    fn resolve(
        object: &'a PdfObject,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<Self, PageAttributeWarningKind> {
        match object {
            PdfObject::Reference(reference) => resolver
                .resolve(*reference)
                .map(Self::Resolved)
                .map_err(PageAttributeWarningKind::Resolution),
            direct => Ok(Self::Direct(direct)),
        }
    }

    fn object(&self) -> &PdfObject {
        match self {
            Self::Direct(object) => object,
            Self::Resolved(object) => object,
        }
    }
}

struct AttributeReader<'a, 'r, 'input> {
    node: ObjectId,
    dictionary: &'a PdfDictionary,
    resolver: &'r mut ObjectResolver<'input>,
    warnings: &'r mut Vec<PageAttributeWarning>,
}

impl AttributeReader<'_, '_, '_> {
    fn read<T>(
        &mut self,
        key: PageAttributeKey,
        parse: impl FnOnce(&PdfObject, &mut ObjectResolver<'_>) -> Result<T, PageAttributeWarningKind>,
    ) -> Option<T> {
        let object = self.dictionary.get(key.as_bytes())?;
        if matches!(object, PdfObject::Null) {
            return None;
        }
        let result = Value::resolve(object, self.resolver)
            .and_then(|value| parse(value.object(), self.resolver));
        match result {
            Ok(value) => Some(value),
            Err(kind) => {
                self.warnings
                    .push(PageAttributeWarning::new(self.node, key, kind));
                None
            }
        }
    }

    fn rectangle(
        object: &PdfObject,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<Rectangle, PageAttributeWarningKind> {
        let PdfObject::Array(array) = object else {
            return Err(Self::invalid_type(object));
        };
        if array.len() != 4 {
            return Err(PageAttributeWarningKind::InvalidRectangle(
                RectangleError::InvalidLength {
                    actual: array.len(),
                },
            ));
        }
        if !array
            .iter()
            .any(|element| matches!(element, PdfObject::Reference(_)))
        {
            return Rectangle::try_from(array).map_err(PageAttributeWarningKind::InvalidRectangle);
        }

        let mut resolved = PdfArray::new();
        for (index, element) in array.iter().enumerate() {
            let value = Value::resolve(element, resolver)?;
            match value.object() {
                PdfObject::Integer(number) => resolved.push(PdfObject::Integer(*number)),
                PdfObject::Real(number) => resolved.push(PdfObject::Real(*number)),
                other => {
                    return Err(PageAttributeWarningKind::InvalidRectangle(
                        RectangleError::InvalidElement {
                            index,
                            actual: other.kind(),
                        },
                    ));
                }
            }
        }
        Rectangle::try_from(&resolved).map_err(PageAttributeWarningKind::InvalidRectangle)
    }

    fn resources(
        object: &PdfObject,
        _: &mut ObjectResolver<'_>,
    ) -> Result<PdfDictionary, PageAttributeWarningKind> {
        let PdfObject::Dictionary(dictionary) = object else {
            return Err(Self::invalid_type(object));
        };
        // 出力が辞書を所有するためにコピーする。辞書内の参照は解決・マージしない。
        Ok(dictionary.clone())
    }

    fn rotation(
        object: &PdfObject,
        _: &mut ObjectResolver<'_>,
    ) -> Result<PageRotation, PageAttributeWarningKind> {
        let PdfObject::Integer(degrees) = object else {
            return Err(Self::invalid_type(object));
        };
        PageRotation::new(degrees.value()).ok_or(PageAttributeWarningKind::InvalidRotation {
            degrees: degrees.value(),
        })
    }

    fn invalid_type(object: &PdfObject) -> PageAttributeWarningKind {
        PageAttributeWarningKind::InvalidType {
            actual: object.kind(),
        }
    }
}

#[derive(Default)]
struct InheritedAttributes {
    media: Option<Rectangle>,
    crop: Option<Rectangle>,
    resources: Option<PdfDictionary>,
    rotation: Option<PageRotation>,
    warnings: Vec<PageAttributeWarning>,
}

impl InheritedAttributes {
    fn visit(
        &mut self,
        node: ObjectId,
        dictionary: &PdfDictionary,
        resolver: &mut ObjectResolver<'_>,
    ) {
        let mut reader = AttributeReader {
            node,
            dictionary,
            resolver,
            warnings: &mut self.warnings,
        };
        if self.media.is_none() {
            self.media = reader.read(PageAttributeKey::MediaBox, AttributeReader::rectangle);
        }
        if self.crop.is_none() {
            self.crop = reader.read(PageAttributeKey::CropBox, AttributeReader::rectangle);
        }
        if self.resources.is_none() {
            self.resources = reader.read(PageAttributeKey::Resources, AttributeReader::resources);
        }
        if self.rotation.is_none() {
            self.rotation = reader.read(PageAttributeKey::Rotate, AttributeReader::rotation);
        }
    }

    fn finish(self, page: ObjectId) -> Result<PageAttributes, PageAttributeError> {
        let media = self
            .media
            .ok_or(PageAttributeError::MissingMediaBox { page })?;
        Ok(PageAttributes::new(
            media,
            self.crop,
            self.resources.unwrap_or_default(),
            self.rotation.unwrap_or(PageRotation::Degrees0),
            self.warnings,
        ))
    }
}

struct ParentChain {
    root: IndirectRef,
    seen: HashSet<ObjectId>,
}

impl ParentChain {
    fn next(
        &mut self,
        reference: IndirectRef,
        dictionary: &PdfDictionary,
    ) -> Result<Option<IndirectRef>, PageAttributeError> {
        let node = reference.target();
        if !self.seen.insert(node) {
            return Err(PageAttributeError::ParentCycle { node });
        }
        let parent = dictionary.get(b"Parent".as_slice());
        if reference == self.root {
            if matches!(parent, None | Some(PdfObject::Null)) {
                return Ok(None);
            }
            return Err(PageAttributeError::RootHasParent { node });
        }
        match parent {
            None | Some(PdfObject::Null) => Err(PageAttributeError::MissingParent { node }),
            Some(PdfObject::Reference(parent)) => Ok(Some(*parent)),
            Some(value) => Err(PageAttributeError::InvalidParent {
                node,
                actual: value.kind(),
            }),
        }
    }

    fn dictionary(
        node: ObjectId,
        object: &PdfObject,
    ) -> Result<&PdfDictionary, PageAttributeError> {
        match object {
            PdfObject::Dictionary(dictionary) => Ok(dictionary),
            value => Err(PageAttributeError::NotADictionary {
                node,
                actual: value.kind(),
            }),
        }
    }
}

impl ObjectResolver<'_> {
    /// 列挙済みページから Parent を根まで辿り、4属性の継承・参照解決・既定値を適用する。
    /// 無効な属性は警告して祖先を探す。親の欠落・循環・解決失敗、MediaBox 不在はエラー。
    /// `page` は同じ resolver の `page_tree` で取得する。親の深さ上限は設けない。
    ///
    /// ```
    /// use pdfmod_core::{catalog::Catalog, resolver::ObjectResolver};
    /// use pdfmod_core::page_tree::attributes::error::PageAttributeError;
    /// # fn example(resolver: &mut ObjectResolver<'_>, catalog: &Catalog) -> Result<(), PageAttributeError> {
    /// # let tree = resolver.page_tree(catalog).unwrap();
    /// for page in tree.pages() {
    ///     let attributes = resolver.page_attributes(page)?;
    ///     let width = attributes.media_box().width();
    ///     let rotation = attributes.rotation().degrees();
    ///     let warnings = attributes.warnings();
    /// }
    /// # Ok(())
    /// # }
    /// ```
    pub fn page_attributes(&mut self, page: &Page) -> Result<PageAttributes, PageAttributeError> {
        let mut inherited = InheritedAttributes::default();
        let mut chain = ParentChain {
            root: page.root(),
            seen: HashSet::new(),
        };
        let mut reference = page.reference();
        let mut object = None;
        loop {
            let current = object.as_deref().unwrap_or_else(|| page.object());
            let dictionary = ParentChain::dictionary(reference.target(), current)?;
            let parent = chain.next(reference, dictionary)?;
            inherited.visit(reference.target(), dictionary, self);
            let Some(parent) = parent else {
                return inherited.finish(page.reference().target());
            };
            object = Some(self.resolve(parent).map_err(|cause| {
                PageAttributeError::ParentResolution {
                    node: reference.target(),
                    cause,
                }
            })?);
            reference = parent;
        }
    }
}
