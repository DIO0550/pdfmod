//! 既知の項目だけを解決し、項目ごとに解析結果を返す。

use super::{error::InfoValueError, trapped::Trapped};
use crate::{
    date::PdfDate,
    object::{PdfDictionary, PdfObject},
    resolver::ObjectResolver,
    text_string::{DecodePolicy, PdfTextString},
};

pub(super) struct InfoReader<'a, 'r, 'input> {
    pub(super) dictionary: &'a PdfDictionary,
    pub(super) resolver: &'r mut ObjectResolver<'input>,
}

impl InfoReader<'_, '_, '_> {
    fn read<T>(
        &mut self,
        key: &[u8],
        parse: impl FnOnce(&PdfObject) -> Result<T, InfoValueError>,
    ) -> Result<Option<T>, InfoValueError> {
        let Some(value) = self.dictionary.get(key) else {
            return Ok(None);
        };
        let resolved;
        let object = match value {
            PdfObject::Reference(reference) => {
                resolved = self
                    .resolver
                    .resolve(*reference)
                    .map_err(InfoValueError::Resolution)?;
                resolved.as_ref()
            }
            direct => direct,
        };
        if matches!(object, PdfObject::Null) {
            return Ok(None);
        }
        parse(object).map(Some)
    }

    pub(super) fn text(&mut self, key: &[u8]) -> Result<Option<PdfTextString>, InfoValueError> {
        self.read(key, |object| {
            let PdfObject::String(string) = object else {
                return Err(Self::invalid_type(object));
            };
            PdfTextString::decode(string.as_bytes(), DecodePolicy::Strict)
                .map_err(InfoValueError::TextDecode)
        })
    }

    pub(super) fn date(&mut self, key: &[u8]) -> Result<Option<PdfDate>, InfoValueError> {
        self.read(key, |object| {
            let PdfObject::String(string) = object else {
                return Err(Self::invalid_type(object));
            };
            PdfDate::from_bytes(string.as_bytes()).ok_or(InfoValueError::InvalidDate)
        })
    }

    pub(super) fn trapped(&mut self) -> Result<Trapped, InfoValueError> {
        self.read(b"Trapped", |object| {
            let PdfObject::Name(name) = object else {
                return Err(Self::invalid_type(object));
            };
            Ok(Trapped::from_bytes(name.as_bytes()))
        })
        .map(|value| value.unwrap_or_default())
    }

    fn invalid_type(object: &PdfObject) -> InfoValueError {
        InfoValueError::InvalidType {
            actual: object.kind(),
        }
    }
}
