//! PDF オブジェクト型を定義するモジュール。
//!
//! ISO 32000 の PDF オブジェクト（null / boolean / numeric / string / name /
//! array / dictionary / stream / indirect reference）を表す。
//! `PdfObject`（null / boolean / integer / real / string / name / array /
//! dictionary / stream / reference）と、補助の型（`PdfName` / `PdfDictionary` /
//! `PdfStream` / `ObjectId` / `ObjectNumber` / `GenerationNumber` /
//! `IndirectRef`）を提供する。

pub mod dictionary;
pub mod generation_number;
pub mod indirect_ref;
pub mod name;
pub mod object_id;
pub mod object_number;
pub mod pdf_object;
pub mod stream;
