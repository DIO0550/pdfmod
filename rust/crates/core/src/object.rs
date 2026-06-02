//! PDF オブジェクト型を定義するモジュール。
//!
//! ISO 32000 の PDF オブジェクト（boolean / numeric / string / name /
//! array / dictionary / stream / null / indirect reference）を表す型を
//! 後続 Issue で追加する。

pub mod object_number;

// 後続 Issue で各オブジェクト型をサブモジュールとして追加する（以下は例の一部）:
// pub mod boolean;
// pub mod numeric;
// pub mod string;
