//! ストリームオブジェクト（`<< /Length N >> stream ... endstream`）のパースを担う層。
//!
//! ISO 32000-1 §7.3.8 に従い、辞書パース完了直後の StreamBegin 検出、
//! `/Length` バイトの生バイト切り出し、`stream` 直後の CRLF/LF 検証、
//! および `endstream` 直前の必須 EOL とキーワード境界の厳格検証を行う。
//! 本モジュールは間接オブジェクト経由でのみ発火する（トップレベル
//! [`Parser::parse_object`](super::Parser::parse_object) は従来通り `UnexpectedToken`）。
//!
//! `/Filter` によるデコードや間接参照 `/Length` の解決はスコープ外。仕様違反は
//! 寛容フォールバックせず、専用の `ParseErrorKind` バリアントで即座に失敗する。
//! `endstream` 直前の空白 / コメントは `skip_whitespace` 経由での寛容化を行わず、
//! LF / CRLF のみ許容する（[`expect_endstream`] を参照）。

use crate::byte_offset::ByteOffset;
use crate::lexer::eol::EolKind;
use crate::lexer::token::Token;
use crate::object::dictionary::PdfDictionary;
use crate::object::pdf_object::PdfObject;
use crate::object::stream::PdfStream;
use crate::parser::error::ParseError;

use super::Parser;

impl<'a> Parser<'a> {
    /// 辞書パース完了直後に呼ばれるストリーム昇格エントリ。
    ///
    /// 次トークンが [`Token::StreamBegin`] であれば `Length` バイトを切り出して
    /// [`PdfObject::Stream`] を返す。`StreamBegin` でなければ受け取った辞書を
    /// そのまま [`PdfObject::Dictionary`] として返す（副作用なし）。
    ///
    /// # 契約
    /// - `peek_token` により内部バッファに保留されたトークンがあってもよいが、
    ///   本メソッドは `take_token` で StreamBegin を消費してから生バイトを触るため、
    ///   `take_bytes` の契約は本メソッド内で自然に満たされる。
    ///
    /// # 引数
    /// - `dictionary`: 直前で `parse_object` が返した [`PdfDictionary`]（ムーブ）
    /// - `dict_start`: 辞書 `<<` の開始位置。stream 系エラーの `position` として使う
    pub(super) fn parse_stream_object(
        &mut self,
        dictionary: PdfDictionary,
        dict_start: ByteOffset,
    ) -> Result<PdfObject, ParseError> {
        if !matches!(self.lexer.peek_token_at(0), Some(Token::StreamBegin)) {
            return Ok(PdfObject::Dictionary(dictionary));
        }
        let _ = self.lexer.take_token();
        let after_stream_pos = ByteOffset::new(self.lexer.cursor_position() as u64);

        let length = Self::resolve_stream_length(&dictionary, dict_start)?;
        self.consume_stream_eol(after_stream_pos)?;
        let data_start = ByteOffset::new(self.lexer.cursor_position() as u64);
        let data = self.take_stream_data(length, data_start)?;
        self.expect_endstream(length)?;

        Ok(PdfObject::Stream(PdfStream::new(dictionary, data)))
    }

    /// `/Length` を辞書から取り出し、非負 `usize` として返す。
    ///
    /// エラー位置はすべて `dict_start`（DC-5）。
    /// `i64 → usize` は `usize::try_from` で行い、32bit ターゲットで
    /// `usize` に収まらない場合は `InvalidLengthType { actual_kind: "IntegerTooLarge" }`
    /// として返す（panic 不在契約）。
    fn resolve_stream_length(
        dictionary: &PdfDictionary,
        dict_start: ByteOffset,
    ) -> Result<usize, ParseError> {
        // 一時 PdfName のヒープ確保を避け、静的な名前をバイトスライスのまま引く。
        let value = dictionary
            .get(b"Length".as_slice())
            .ok_or_else(|| ParseError::missing_length_at(dict_start))?;

        match value {
            PdfObject::Integer(n) if *n < 0 => Err(ParseError::negative_length_at(dict_start)),
            PdfObject::Integer(n) => usize::try_from(*n)
                .map_err(|_| ParseError::invalid_length_type_at(dict_start, "IntegerTooLarge")),
            PdfObject::Reference(_) => {
                Err(ParseError::indirect_length_not_supported_at(dict_start))
            }
            other => Err(ParseError::invalid_length_type_at(
                dict_start,
                Self::pdf_object_kind_label(other),
            )),
        }
    }

    /// `stream` キーワード直後の EOL を CRLF/LF のみ許容して消費する。
    ///
    /// [`EolKind::at`] を直接呼ぶことで `skip_whitespace` を経由せず、SP/TAB を
    /// EOL として食わない（DC-4）。CR 単独 / SP / TAB / EOF はいずれも
    /// [`ParseErrorKind::InvalidStreamEol`](super::error::ParseErrorKind::InvalidStreamEol)
    /// として `after_stream_pos`（stream キーワード消費直後の位置）を返す。
    fn consume_stream_eol(&mut self, after_stream_pos: ByteOffset) -> Result<(), ParseError> {
        let pos = self.lexer.cursor_position();
        let input = self.lexer.input();
        match EolKind::at(input, pos) {
            Some(EolKind::Lf) => {
                let _ = self.lexer.skip_bytes(1);
                Ok(())
            }
            Some(EolKind::CrLf) => {
                let _ = self.lexer.skip_bytes(2);
                Ok(())
            }
            Some(EolKind::Cr) | None => Err(ParseError::invalid_stream_eol_at(after_stream_pos)),
        }
    }

    /// `Length` バイトを [`Vec<u8>`] にコピーする。範囲外なら `UnexpectedEof`。
    fn take_stream_data(
        &mut self,
        length: usize,
        data_start: ByteOffset,
    ) -> Result<Vec<u8>, ParseError> {
        self.lexer
            .take_bytes(length)
            .map(|slice| slice.to_vec())
            .ok_or_else(|| ParseError::unexpected_eof_at(data_start))
    }

    /// `Length` バイト消費直後の位置から、`endstream` キーワードとその直前 EOL を厳格に検証する。
    ///
    /// ISO 32000-1 §7.3.8 は「`endstream` の直前に EOL マーカーがある」と規定する（EOL = LF / CR / CRLF）。
    /// 本関数は `skip_whitespace` を経由せず raw byte で判定するため、`endstream` 直前の
    /// トレーリング空白 / コメント / SP / TAB は許容しない。
    ///
    /// # アルゴリズム
    /// 1. `data_len > 0` の場合、`pos_after_data` に EOL (LF/CR/CRLF) が必須。無ければ拒否
    ///    （`/Length` が data 末尾の EOL バイトを "データとして" 数え込んでいる spec 違反を
    ///    catchする — Copilot 指摘対応）。`data_len = 0` の場合は post-stream EOL が
    ///    pre-endstream EOL を兼ねる形も許容するため EOL 消費は任意
    /// 2. カーソル位置から `endstream` バイト列が始まることを確認する
    /// 3. `endstream` の直前バイト（`cursor - 1`）が LF (0x0A) または CR (0x0D) であることを確認する
    ///    （Length=0 かつ pos_after_data で EOL が無かった場合の post-stream EOL 保証）
    ///
    /// # 受理 / 拒否パターン
    /// - `data\nendstream` / `data\r\nendstream` / `data\rendstream` → 受理
    /// - `stream\nendstream`（Length=0、post-stream EOL 兼用）→ 受理
    /// - `stream\n\nendstream`（Length=0、余分な EOL）→ 受理
    /// - `<< /Length 4 >>\nstream\nabc\nendstream`（Length が末尾 LF を含む spec 違反）→ 拒否
    ///   （pos_after_data が 'e' で EOL 無しのため）
    /// - `dataendstream`（Length>0、EOL 無し）→ `MissingEndstream`
    /// - `data \nendstream` / `data\n endstream` → `MissingEndstream`
    /// - `data\nendstream42`（キーワード境界違反）→ lexer が Keyword として返し `MissingEndstream`
    fn expect_endstream(&mut self, data_len: usize) -> Result<(), ParseError> {
        let pos_after_data = self.lexer.cursor_position();
        let input = self.lexer.input();

        match EolKind::at(input, pos_after_data) {
            Some(eol) => {
                let _ = self.lexer.skip_bytes(eol.byte_len());
            }
            None if data_len > 0 => {
                return Err(ParseError::missing_endstream_at(ByteOffset::new(
                    pos_after_data as u64,
                )));
            }
            None => {}
        }

        let cursor = self.lexer.cursor_position();
        let remaining = self.lexer.input().get(cursor..).unwrap_or(&[]);
        if !remaining.starts_with(b"endstream") {
            return Err(ParseError::missing_endstream_at(ByteOffset::new(
                cursor as u64,
            )));
        }

        let preceding_byte = cursor
            .checked_sub(1)
            .and_then(|p| self.lexer.input().get(p).copied());
        if !matches!(preceding_byte, Some(0x0A) | Some(0x0D)) {
            return Err(ParseError::missing_endstream_at(ByteOffset::new(
                cursor as u64,
            )));
        }

        match self.lexer.take_token_with_pos() {
            Some((Token::StreamEnd, _)) => Ok(()),
            Some((_, pos_before)) => Err(ParseError::missing_endstream_at(ByteOffset::new(
                pos_before as u64,
            ))),
            None => {
                let here = ByteOffset::new(self.lexer.cursor_position() as u64);
                if self.lexer.is_eof() {
                    Err(ParseError::missing_endstream_at(here))
                } else {
                    Err(ParseError::lexer_error_at(here))
                }
            }
        }
    }

    /// [`PdfObject`] のバリアント名を [`ParseErrorKind::InvalidLengthType`](super::error::ParseErrorKind::InvalidLengthType) の
    /// `actual_kind` フィールドに載せるための短い `'static` 識別子にマップする。
    fn pdf_object_kind_label(object: &PdfObject) -> &'static str {
        match object {
            PdfObject::Null => "Null",
            PdfObject::Boolean(_) => "Boolean",
            PdfObject::Integer(_) => "Integer",
            PdfObject::Real(_) => "Real",
            PdfObject::String(_) => "String",
            PdfObject::Name(_) => "Name",
            PdfObject::Array(_) => "Array",
            PdfObject::Dictionary(_) => "Dictionary",
            PdfObject::Stream(_) => "Stream",
            PdfObject::Reference(_) => "Reference",
        }
    }
}
