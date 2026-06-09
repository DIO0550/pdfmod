//! PDF オブジェクト型を定義するモジュール。
//!
//! ISO 32000 の PDF オブジェクト（null / boolean / numeric / string / name /
//! array / dictionary / stream / indirect reference）を表す。現時点では
//! `PdfObject`（null / boolean / integer / real / string / name / array /
//! dictionary）と、補助の newtype（`PdfName` / `PdfDictionary` / `ObjectId` /
//! `ObjectNumber` / `GenerationNumber`）を提供し、stream / indirect reference は
//! 後続 Issue で追加する。

pub mod dictionary;
pub mod generation_number;
pub mod name;
pub mod object_id;
pub mod object_number;
pub mod pdf_object;

// stream / indirect reference は後続 Issue で対応する型・サブモジュールを追加する。
