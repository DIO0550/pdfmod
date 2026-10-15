//! ドキュメント情報辞書（docs/specs/03_document_architecture.md §5）。
//! 各項目の失敗を独立して保持し、元の辞書を resolver と共有する。

pub mod error;
mod reader;
pub mod trapped;

use std::rc::Rc;

use crate::{
    byte_offset::ByteOffset, date::PdfDate, object::PdfObject, resolver::ObjectResolver,
    text_string::PdfTextString,
};
use error::{DocumentInfoError, DocumentInfoErrorKind, InfoValueError};
use reader::InfoReader;
use trapped::Trapped;

/// 情報辞書の解析結果。既知項目の成功・不在・失敗を区別し、未知項目も元のまま保持する。
/// Default は Info がない空の結果（Trapped は Unknown）。
#[derive(Debug)]
pub struct DocumentInfo {
    object: Option<Rc<PdfObject>>,
    title: Result<Option<PdfTextString>, InfoValueError>,
    author: Result<Option<PdfTextString>, InfoValueError>,
    subject: Result<Option<PdfTextString>, InfoValueError>,
    keywords: Result<Option<PdfTextString>, InfoValueError>,
    creator: Result<Option<PdfTextString>, InfoValueError>,
    producer: Result<Option<PdfTextString>, InfoValueError>,
    creation_date: Result<Option<PdfDate>, InfoValueError>,
    mod_date: Result<Option<PdfDate>, InfoValueError>,
    trapped: Result<Trapped, InfoValueError>,
}

impl Default for DocumentInfo {
    fn default() -> Self {
        Self {
            object: None,
            title: Ok(None),
            author: Ok(None),
            subject: Ok(None),
            keywords: Ok(None),
            creator: Ok(None),
            producer: Ok(None),
            creation_date: Ok(None),
            mod_date: Ok(None),
            trapped: Ok(Trapped::default()),
        }
    }
}

impl DocumentInfo {
    pub(crate) fn from_object(
        object: Rc<PdfObject>,
        position: ByteOffset,
        resolver: &mut ObjectResolver<'_>,
    ) -> Result<Self, DocumentInfoError> {
        if matches!(object.as_ref(), PdfObject::Null) {
            return Ok(Self::default());
        }
        let PdfObject::Dictionary(dictionary) = object.as_ref() else {
            return Err(DocumentInfoError::new(
                DocumentInfoErrorKind::NotADictionary {
                    actual: object.kind(),
                },
                position,
            ));
        };
        let mut reader = InfoReader {
            dictionary,
            resolver,
        };
        let mut info = Self {
            object: None,
            title: reader.text(b"Title"),
            author: reader.text(b"Author"),
            subject: reader.text(b"Subject"),
            keywords: reader.text(b"Keywords"),
            creator: reader.text(b"Creator"),
            producer: reader.text(b"Producer"),
            creation_date: reader.date(b"CreationDate"),
            mod_date: reader.date(b"ModDate"),
            trapped: reader.trapped(),
        };
        info.object = Some(object);
        Ok(info)
    }

    /// タイトル。不在・Null は Ok(None)、型・符号化・参照解決の不正は Err。
    pub fn title(&self) -> Result<Option<&PdfTextString>, &InfoValueError> {
        self.title.as_ref().map(Option::as_ref)
    }

    /// 作成者名。不在・Null は Ok(None)、型・符号化・参照解決の不正は Err。
    pub fn author(&self) -> Result<Option<&PdfTextString>, &InfoValueError> {
        self.author.as_ref().map(Option::as_ref)
    }

    /// 主題。不在・Null は Ok(None)、型・符号化・参照解決の不正は Err。
    pub fn subject(&self) -> Result<Option<&PdfTextString>, &InfoValueError> {
        self.subject.as_ref().map(Option::as_ref)
    }

    /// キーワード。不在・Null は Ok(None)、型・符号化・参照解決の不正は Err。
    pub fn keywords(&self) -> Result<Option<&PdfTextString>, &InfoValueError> {
        self.keywords.as_ref().map(Option::as_ref)
    }

    /// 元文書の作成アプリ名。不在・Null は Ok(None)、型・符号化・参照解決の不正は Err。
    pub fn creator(&self) -> Result<Option<&PdfTextString>, &InfoValueError> {
        self.creator.as_ref().map(Option::as_ref)
    }

    /// PDF変換アプリ名。不在・Null は Ok(None)、型・符号化・参照解決の不正は Err。
    pub fn producer(&self) -> Result<Option<&PdfTextString>, &InfoValueError> {
        self.producer.as_ref().map(Option::as_ref)
    }

    /// 作成日時。不在・Null は Ok(None)、型・日付・参照解決の不正は Err。
    pub fn creation_date(&self) -> Result<Option<&PdfDate>, &InfoValueError> {
        self.creation_date.as_ref().map(Option::as_ref)
    }

    /// 更新日時。不在・Null は Ok(None)、型・日付・参照解決の不正は Err。
    pub fn mod_date(&self) -> Result<Option<&PdfDate>, &InfoValueError> {
        self.mod_date.as_ref().map(Option::as_ref)
    }

    /// トラッピング状態。省略・Null・未知の名前は Unknown、型・参照解決の不正は Err。
    pub fn trapped(&self) -> Result<Trapped, &InfoValueError> {
        self.trapped.as_ref().copied()
    }

    /// 元の情報辞書。Info 不在・Null の場合は None。
    pub fn object(&self) -> Option<&PdfObject> {
        self.object.as_deref()
    }

    /// 既知・未知のエントリを変更・解決せず返す。不在なら None。
    pub fn entry(&self, key: &[u8]) -> Option<&PdfObject> {
        self.object()?.as_dictionary()?.get(key)
    }
}
