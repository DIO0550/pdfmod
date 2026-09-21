//! オブジェクトストリーム辞書の検証済みメタデータ（ISO 32000-1 §7.5.7）。

use crate::byte_offset::ByteOffset;
use crate::object::dictionary::PdfDictionary;
use crate::object::object_id::ObjectId;
use crate::object::pdf_object::PdfObject;
use crate::object_stream::error::{ObjectStreamError, ObjectStreamErrorKind};
use crate::object_stream::key::ObjectStreamKey;

/// オブジェクトストリーム辞書の検証済みメタデータ（ISO 32000-1 §7.5.7）。
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ObjectStreamMetadata {
    n: usize,
    first: usize,
    extends: Option<ObjectId>,
}

impl ObjectStreamMetadata {
    /// PDF 辞書を検証し、オブジェクトストリームメタデータを抽出・構築する。
    pub fn from_dictionary(
        dict: &PdfDictionary,
        pos: ByteOffset,
    ) -> Result<Self, ObjectStreamError> {
        // 1. /Type /ObjStm 検証
        match dict.get(ObjectStreamKey::Type.as_bytes()) {
            Some(PdfObject::Name(name)) if name.as_bytes() == b"ObjStm" => (),
            Some(PdfObject::Name(_)) => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::NotAnObjectStream,
                    pos,
                ));
            }
            Some(other) => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::Type,
                        actual: other.kind(),
                    },
                    pos,
                ))
            }
            None => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::MissingRequiredKey(ObjectStreamKey::Type),
                    pos,
                ))
            }
        }

        // 2. /N 抽出・検証（正整数）
        let n = match dict.get(ObjectStreamKey::N.as_bytes()) {
            Some(PdfObject::Integer(n)) => {
                if *n <= 0 {
                    return Err(ObjectStreamError::new(
                        ObjectStreamErrorKind::InvalidN(*n),
                        pos,
                    ));
                }
                usize::try_from(*n)
                    .map_err(|_| ObjectStreamError::new(ObjectStreamErrorKind::InvalidN(*n), pos))?
            }
            Some(other) => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::N,
                        actual: other.kind(),
                    },
                    pos,
                ))
            }
            None => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::MissingRequiredKey(ObjectStreamKey::N),
                    pos,
                ))
            }
        };

        // 3. /First 抽出・検証（非負整数）
        let first = match dict.get(ObjectStreamKey::First.as_bytes()) {
            Some(PdfObject::Integer(first)) => {
                if *first < 0 {
                    return Err(ObjectStreamError::new(
                        ObjectStreamErrorKind::InvalidFirst(*first),
                        pos,
                    ));
                }
                usize::try_from(*first).map_err(|_| {
                    ObjectStreamError::new(ObjectStreamErrorKind::InvalidFirst(*first), pos)
                })?
            }
            Some(other) => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::First,
                        actual: other.kind(),
                    },
                    pos,
                ))
            }
            None => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::MissingRequiredKey(ObjectStreamKey::First),
                    pos,
                ))
            }
        };

        // 4. /Extends 抽出（任意、間接参照）
        let extends = match dict.get(ObjectStreamKey::Extends.as_bytes()) {
            None => None,
            Some(PdfObject::Reference(indirect_ref)) => Some(indirect_ref.target()),
            Some(other) => {
                return Err(ObjectStreamError::new(
                    ObjectStreamErrorKind::InvalidKeyType {
                        key: ObjectStreamKey::Extends,
                        actual: other.kind(),
                    },
                    pos,
                ))
            }
        };

        Ok(Self { n, first, extends })
    }

    /// ストリーム内に格納されたオブジェクト数（`/N`）を取得する。
    #[inline]
    #[must_use]
    pub const fn n(&self) -> usize {
        self.n
    }

    /// 最初のオブジェクトデータへの相対バイトオフセット（`/First`）を取得する。
    #[inline]
    #[must_use]
    pub const fn first(&self) -> usize {
        self.first
    }

    /// 拡張元のオブジェクトストリーム ID（`/Extends`）を取得する。
    #[inline]
    #[must_use]
    pub const fn extends(&self) -> Option<ObjectId> {
        self.extends
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::object::generation_number::GenerationNumber;
    use crate::object::indirect_ref::IndirectRef;
    use crate::object::name::PdfName;
    use crate::object::object_number::ObjectNumber;

    #[test]
    fn valid_metadata() {
        let mut dict = PdfDictionary::new();
        dict.insert(
            PdfName::new(b"Type"),
            PdfObject::Name(PdfName::new(b"ObjStm")),
        );
        dict.insert(PdfName::new(b"N"), PdfObject::Integer(10));
        dict.insert(PdfName::new(b"First"), PdfObject::Integer(120));

        let meta = ObjectStreamMetadata::from_dictionary(&dict, ByteOffset::new(0)).unwrap();
        assert_eq!(meta.n(), 10);
        assert_eq!(meta.first(), 120);
        assert_eq!(meta.extends(), None);
    }

    #[test]
    fn valid_metadata_with_extends() {
        let mut dict = PdfDictionary::new();
        dict.insert(
            PdfName::new(b"Type"),
            PdfObject::Name(PdfName::new(b"ObjStm")),
        );
        dict.insert(PdfName::new(b"N"), PdfObject::Integer(5));
        dict.insert(PdfName::new(b"First"), PdfObject::Integer(50));
        let target_id = ObjectId::new(ObjectNumber::new(15).unwrap(), GenerationNumber::new(0));
        dict.insert(
            PdfName::new(b"Extends"),
            PdfObject::Reference(IndirectRef::new(target_id)),
        );

        let meta = ObjectStreamMetadata::from_dictionary(&dict, ByteOffset::new(0)).unwrap();
        assert_eq!(meta.n(), 5);
        assert_eq!(meta.first(), 50);
        assert_eq!(meta.extends(), Some(target_id));
    }

    #[test]
    fn missing_type_fails() {
        let mut dict = PdfDictionary::new();
        dict.insert(PdfName::new(b"N"), PdfObject::Integer(1));
        dict.insert(PdfName::new(b"First"), PdfObject::Integer(10));

        let err = ObjectStreamMetadata::from_dictionary(&dict, ByteOffset::new(0)).unwrap_err();
        assert_eq!(
            err.kind,
            ObjectStreamErrorKind::MissingRequiredKey(ObjectStreamKey::Type)
        );
    }

    #[test]
    fn invalid_n_fails() {
        let mut dict = PdfDictionary::new();
        dict.insert(
            PdfName::new(b"Type"),
            PdfObject::Name(PdfName::new(b"ObjStm")),
        );
        dict.insert(PdfName::new(b"N"), PdfObject::Integer(0));
        dict.insert(PdfName::new(b"First"), PdfObject::Integer(10));

        let err = ObjectStreamMetadata::from_dictionary(&dict, ByteOffset::new(0)).unwrap_err();
        assert_eq!(err.kind, ObjectStreamErrorKind::InvalidN(0));
    }

    #[test]
    fn negative_first_fails() {
        let mut dict = PdfDictionary::new();
        dict.insert(
            PdfName::new(b"Type"),
            PdfObject::Name(PdfName::new(b"ObjStm")),
        );
        dict.insert(PdfName::new(b"N"), PdfObject::Integer(1));
        dict.insert(PdfName::new(b"First"), PdfObject::Integer(-1));

        let err = ObjectStreamMetadata::from_dictionary(&dict, ByteOffset::new(0)).unwrap_err();
        assert_eq!(err.kind, ObjectStreamErrorKind::InvalidFirst(-1));
    }

    #[test]
    fn not_objstm_type_fails() {
        let mut dict = PdfDictionary::new();
        dict.insert(
            PdfName::new(b"Type"),
            PdfObject::Name(PdfName::new(b"Catalog")),
        );
        dict.insert(PdfName::new(b"N"), PdfObject::Integer(1));
        dict.insert(PdfName::new(b"First"), PdfObject::Integer(10));

        let err = ObjectStreamMetadata::from_dictionary(&dict, ByteOffset::new(0)).unwrap_err();
        assert_eq!(err.kind, ObjectStreamErrorKind::NotAnObjectStream);
    }
}
