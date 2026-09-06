mod array_dictionary;
mod conversion;
mod eq_clone_debug;
mod kind;
mod primitive_variants;
mod reference;
mod stream;
mod string_name;

use super::*;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;

// テスト用に代表的な IndirectRef を構築するヘルパ（オブジェクト番号 n・世代 g）
fn make_ref(n: u64, g: u16) -> IndirectRef {
    IndirectRef::new(ObjectId::new(
        ObjectNumber::new(n).expect("positive object number"),
        GenerationNumber::new(g),
    ))
}

// テスト用に空辞書 + 指定データの PdfStream を構築するヘルパ
fn make_stream(data: &[u8]) -> PdfStream {
    PdfStream::new(PdfDictionary::new(), data)
}
