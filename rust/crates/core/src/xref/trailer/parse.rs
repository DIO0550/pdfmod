//! 従来形式トレイラの解析入口（ISO 32000-1:2008 §7.5.5、
//! `docs/specs/02_file_structure.md` §5）。
//!
//! [`ParsedXRefTable::end`] が返す位置から `trailer` キーワードを検証し、
//! 続く辞書を [`Parser::parse_object`] でパースして [`Trailer`] を構築する。
//!
//! # キーワード検証を lexer に任せない理由
//!
//! `trailer` は lexer では `Token::Keyword(Keyword::Trailer)` になり、
//! [`Parser::parse_object`] は Keyword トークンを `UnexpectedToken` で
//! 弾く。そのため `xref/table/parse.rs` の `expect_xref_keyword` と同じく、
//! 生バイト比較＋トークン境界チェックで検出する。
//!
//! # スコープ外
//!
//! `/Prev` を辿るチェーン走査（#589）・xref ストリームの辞書解析は
//! 本モジュールの責務ではない。辞書を読み終えた位置は
//! [`ParsedTrailer::end`] で返す。
//!
//! [`ParsedXRefTable::end`]: crate::xref::table::parse::ParsedXRefTable::end

use crate::byte_offset::ByteOffset;
use crate::lexer::byte_ops::keyword_end_at;
use crate::lexer::skip::skip_whitespace_and_comments;
use crate::lexer::token::Keyword;
use crate::object::pdf_object::PdfObject;
use crate::parser::Parser;
use crate::xref::trailer::error::TrailerError;
use crate::xref::trailer::Trailer;

/// 従来形式トレイラの解析結果。
///
/// 構築した [`Trailer`] と、辞書を読み終えた位置を持つ。
/// `end` は閉じ `>>` の直後を指し、通常はその先に `startxref` が続く。
#[derive(Debug, Clone, PartialEq)]
#[must_use]
pub struct ParsedTrailer {
    trailer: Trailer,
    end: ByteOffset,
}

impl ParsedTrailer {
    /// 従来形式トレイラを解析する。
    ///
    /// `start` は `trailer` キーワードの位置
    /// （通常は [`ParsedXRefTable::end`] が返した値）。
    /// その位置から空白・コメントを読み飛ばした先に `trailer` があることを確認し、
    /// 続く辞書をパースして主要キーを取り出す。
    ///
    /// # Errors
    ///
    /// - `MissingTrailerKeyword` — `start` が入力範囲外、または空白を飛ばした先が
    ///   `trailer`（＋トークン境界）でない
    /// - `ObjectParseFailed` — 辞書が `>>` で閉じない、キーが名前でない、入力が尽きた等
    /// - `NotADictionary` — `trailer` の後が辞書ではない
    /// - `MissingRequiredKey` / `InvalidKeyType` / `NegativeValue` / `InvalidIdArray`
    ///   — キーの検証に失敗した（[`Trailer::from_dictionary`] を参照）
    ///
    /// [`ParsedXRefTable::end`]: crate::xref::table::parse::ParsedXRefTable::end
    pub fn parse(input: &[u8], start: ByteOffset) -> Result<Self, TrailerError> {
        // ByteOffset(u64) → usize。入力範囲外なら、その位置に trailer キーワードは無い。
        let Ok(begin) = usize::try_from(start.value()) else {
            return Err(TrailerError::missing_trailer_keyword_at(start));
        };
        if begin > input.len() {
            return Err(TrailerError::missing_trailer_keyword_at(start));
        }

        let after_keyword = expect_trailer_keyword(input, begin)?;

        let mut parser = Parser::new_at(input, after_keyword);
        let object = parser
            .parse_object()
            .map_err(|error| TrailerError::object_parse_failed_at(error.position, error.kind))?;
        // 辞書の開始位置は parse_object が消費し終えた後には取れないため、
        // キーワード直後の空白を飛ばした位置をキー検証エラーの位置として使う。
        let dictionary_start = offset_of(skip_whitespace_and_comments(
            input,
            after_keyword,
            input.len(),
        ));

        let PdfObject::Dictionary(dictionary) = object else {
            return Err(TrailerError::not_a_dictionary_at(
                dictionary_start,
                object.kind(),
            ));
        };

        let trailer = Trailer::from_dictionary(dictionary, dictionary_start)?;

        Ok(Self {
            trailer,
            end: parser.position(),
        })
    }

    /// 構築されたトレイラへの参照を返す。
    pub fn trailer(&self) -> &Trailer {
        &self.trailer
    }

    /// 構築されたトレイラを取り出す（所有権を移す）。
    pub fn into_trailer(self) -> Trailer {
        self.trailer
    }

    /// 辞書を読み終えた位置を返す。閉じ `>>` の直後を指す。
    pub fn end(&self) -> ByteOffset {
        self.end
    }
}

/// 空白・コメントを飛ばした先に `trailer` キーワードがあることを確認し、その直後の位置を返す。
///
/// 一致判定とトークン境界チェックは共有ヘルパ [`keyword_end_at`] に委ね、
/// ここは空白スキップとエラー生成だけを担う（`expect_xref_keyword` と同じ構造）。
/// 前方境界は呼び出し元の `start` が既にトークン開始位置である前提のため見ない。
fn expect_trailer_keyword(input: &[u8], pos: usize) -> Result<usize, TrailerError> {
    let keyword_start = skip_whitespace_and_comments(input, pos, input.len());

    keyword_end_at(input, keyword_start, Keyword::Trailer.as_bytes())
        .ok_or_else(|| TrailerError::missing_trailer_keyword_at(offset_of(keyword_start)))
}

/// 内部カーソル（`usize`）を公開境界の [`ByteOffset`] に変換する。
fn offset_of(pos: usize) -> ByteOffset {
    ByteOffset::new(pos as u64)
}

#[cfg(test)]
mod tests;
