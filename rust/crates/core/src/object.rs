//! PDF オブジェクト型を定義するモジュール。
//!
//! ISO 32000 の PDF オブジェクト（null / boolean / numeric / string / name /
//! array / dictionary / stream / indirect reference）を表す。
//! `PdfObject`（null / boolean / integer / real / string / name / array /
//! dictionary / stream / reference）と、補助の型（`PdfBoolean` / `PdfInteger` /
//! `PdfReal` / `PdfArray` / `PdfString` / `StringEncoding` /
//! `PdfName` / `PdfDictionary` / `PdfStream` / `ObjectId` / `ObjectNumber` /
//! `FreeObjectNumber` / `GenerationNumber` / `IndirectObject` / `IndirectRef` /
//! `ObjectKind`）を提供する。

pub mod array;
pub mod boolean;
pub mod dictionary;
pub mod free_object_number;
pub mod generation_number;
pub mod indirect_object;
pub mod indirect_ref;
pub mod integer;
pub mod name;
pub mod object_id;
pub mod object_kind;
pub mod object_number;
pub mod pdf_object;
pub mod real;
pub mod stream;
pub mod string;

pub use self::array::PdfArray;
pub use self::boolean::PdfBoolean;
pub use self::dictionary::PdfDictionary;
pub use self::free_object_number::FreeObjectNumber;
pub use self::generation_number::GenerationNumber;
pub use self::indirect_object::IndirectObject;
pub use self::indirect_ref::IndirectRef;
pub use self::integer::PdfInteger;
pub use self::name::PdfName;
pub use self::object_id::ObjectId;
pub use self::object_kind::ObjectKind;
pub use self::object_number::ObjectNumber;
pub use self::pdf_object::PdfObject;
pub use self::real::PdfReal;
pub use self::stream::PdfStream;
pub use self::string::{PdfString, StringEncoding};
