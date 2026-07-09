//! `parse_stream_object` の単体・統合テスト。
//!
//! DC-9 に従い「1 パターン = 1 ファイル」で分割。
//! 共通ヘルパは本ファイルに集約し、各テストファイルはこのヘルパを介して
//! [`crate::object::stream::PdfStream`] または [`crate::parser::error::ParseError`] を検証する。

use crate::byte_offset::ByteOffset;
use crate::object::pdf_object::PdfObject;
use crate::object::stream::PdfStream;
use crate::parser::error::ParseError;

use super::Parser;

mod basic;
mod binary_data;
mod eof_boundary;
mod indirect_length;
mod integration;
mod invalid_length_type;
mod invalid_stream_eol;
mod missing_endstream;
mod missing_length;
mod negative_length;
mod pdf_sample;

/// `<< /Length N >> stream ... endstream` の入力を丸ごと渡し、成功時の
/// [`PdfStream`] を返すヘルパ。
///
/// `parse_object` で辞書を先に読み、続いて `parse_stream_object` を直接呼び出す
/// ことで stream 昇格ロジックのみを分離テストする。
fn parse_stream(input: &[u8]) -> PdfStream {
    let mut parser = Parser::new(input);
    let dict_start = parser.position();
    let obj = parser.parse_object().expect("dictionary must parse");
    let PdfObject::Dictionary(dictionary) = obj else {
        panic!("expected dictionary at head of input, got {obj:?}");
    };
    let result = parser
        .parse_stream_object(dictionary, dict_start)
        .expect("stream must parse");
    match result {
        PdfObject::Stream(stream) => stream,
        other => panic!("expected Stream, got {other:?}"),
    }
}

/// stream 昇格でエラーを返すことを期待する入力向けヘルパ。
fn parse_stream_err(input: &[u8]) -> ParseError {
    let mut parser = Parser::new(input);
    let dict_start = parser.position();
    let obj = parser.parse_object().expect("dictionary must parse");
    let PdfObject::Dictionary(dictionary) = obj else {
        panic!("expected dictionary at head of input, got {obj:?}");
    };
    parser
        .parse_stream_object(dictionary, dict_start)
        .expect_err("stream parse must fail for this input")
}

/// dict_start を明示保持したまま `ByteOffset` にラップして返す薄いヘルパ。
///
/// 各エラーテストで `dict_start` の位置検証（DC-5）を透過的に行うため、
/// テスト側で `ByteOffset::new(...)` を毎回書かずに済むようにする。
fn byte_offset(pos: u64) -> ByteOffset {
    ByteOffset::new(pos)
}
