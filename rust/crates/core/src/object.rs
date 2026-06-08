//! PDF オブジェクト型を定義するモジュール。
//!
//! ISO 32000 の PDF オブジェクト（boolean / numeric / string / name /
//! array / dictionary / stream / null / indirect reference）を表す型を
//! 後続 Issue で追加する。

pub mod dictionary;
pub mod generation_number;
pub mod name;
pub mod object_id;
pub mod object_number;
pub mod pdf_object;

// 後続 Issue で各オブジェクト型をサブモジュールとして追加する（以下は例の一部）:
// pub mod boolean;
// pub mod numeric;
// pub mod string;
