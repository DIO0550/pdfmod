//! PDF オブジェクトのパース層。
//!
//! lexer が返す [`Token`](crate::lexer::token::Token) を ISO 32000-1 §7.3 の
//! オブジェクトに意味付けして [`PdfObject`] に変換する。本モジュールは
//! スカラ 7 種（Null / Boolean / Integer / Real / LiteralString / HexString /
//! Name）・配列（ISO §7.3.6）・辞書（ISO §7.3.7、`PdfDictionary` を内包）・
//! 間接参照（ISO §7.3.10、`PdfObject::Reference`）を扱い、配列/辞書は要素/値に
//! 配列・辞書・間接参照を含むネストを再帰的にサポートする。stream は対象外。
//!
//! `LiteralString` と `HexString` は同じ `PdfObject::String` バリアントに集約するが、
//! 字句の出自は [`PdfString`] の `encoding` として
//! 保持する（所有ムーブのため clone は発生しない）。`Token::Comment` は透過的にスキップする。
//! 辞書のキーは `Primitive::Name` のみ受理、値が `Null` のエントリは ISO §7.3.7 準拠で
//! `PdfDictionary` に登録しない（重複キーで既存値がある場合は削除する）。
//!
//! 間接参照は `Integer(N) Integer(G) Keyword(Keyword::R)` の 3 トークン列を `Lexer` の
//! token 単位 peek API（`peek_token_at(0/1)` + `take_token`）で検出する。
//! `N` が非負で `G` が [`GenerationNumber`] に変換できるときのみ発火し、
//! `N >= 1` なら [`PdfObject::Reference`]、**`N == 0` なら [`PdfObject::Null`]** を返す
//! （0 は §7.5.4 のフリーリスト先頭に予約された番号で、解決結果が常に null になるため。#334）。
//! 不成立時は peek 済みトークンが `Lexer` 内部バッファに保留されたまま
//! `Ok(None)` を返し、呼び出し元は `N` を [`PdfObject::Integer`] として発行する。
//! 保留中のトークンは次回 `parse_object` 系で透過的に取り出される（ISO 32000-1 §7.3.10）。

pub mod error;
mod stream_object;

use crate::byte_offset::ByteOffset;
use crate::lexer::token::{Keyword, Primitive, Token};
use crate::lexer::LexOutcome;
use crate::lexer::Lexer;

/// `try_parse_indirect_reference` 内部で peek 結果を借用切れにしてから分岐するための分類タグ。
///
/// `Lexer::peek_token_at` の戻り値が握る `&Token` の借用が、後続の `take_token()` の
/// 可変借用と衝突するため、まず純粋な分類値に変換する。[`LexOutcome`] 化後も `&Token` を
/// 握る点は変わらないため、このタグは引き続き必要である。
///
/// 一方で旧 `Unavailable`（EOF か malformed か未分解）は [`LexOutcome`] の導入により
/// `Eof` / `Malformed` に分解でき、`is_eof()` の追い問い合わせが不要になった。
/// なお `Mismatch`（トークンは取れたが期待した型ではない）は [`LexOutcome`] に存在しない
/// 概念のため、本タグを [`LexOutcome`] に吸収して消すことはできない。
#[derive(Debug)]
enum PeekClass<T> {
    Match(T),
    Mismatch,
    Eof,
    Malformed { position: usize },
}
use crate::object::dictionary::PdfDictionary;
use crate::object::generation_number::GenerationNumber;
use crate::object::indirect_object::IndirectObject;
use crate::object::indirect_ref::IndirectRef;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::object::string::PdfString;
use crate::parser::error::ParseError;

/// PDF バイト列から [`PdfObject`] を 1 つずつ取り出すパーサ。
///
/// 内部に [`Lexer`] をムーブで保持し、カーソル位置の管理と lookahead バッファを
/// 委譲する。[`Primitive`] の所有データは [`PdfObject`] にそのままムーブし、
/// `Vec<u8>` の clone は行わない。
///
/// 任意の入力に対して panic しない契約を持つ（lexer の契約をそのまま継承）。
#[derive(Debug)]
pub struct Parser<'a> {
    lexer: Lexer<'a>,
}

impl<'a> Parser<'a> {
    /// 入力バイト列から新しいパーサを構築する。`pos` は 0 で初期化される。
    #[must_use]
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            lexer: Lexer::new(input),
        }
    }

    /// 入力バイト列と開始位置から新しいパーサを構築する。
    ///
    /// 入力をスライスせずに `pos` から読み始めるため、[`Self::position`] と
    /// [`ParseError`] の `position` は入力先頭起点の絶対オフセットのままになる。
    /// ファイル中間の構造（トレイラ辞書など）を読む用途で使う。
    /// `pos` が `input.len()` を超える場合は [`Lexer::new_at`] が末尾にクランプする。
    #[must_use]
    pub fn new_at(input: &'a [u8], pos: usize) -> Self {
        Self {
            lexer: Lexer::new_at(input, pos),
        }
    }

    /// 現在の論理カーソル位置をバイトオフセットで返す。
    ///
    /// [`Lexer::position`] が返す論理カーソル位置（lookahead バッファに peek 済みの
    /// トークンがあればその先頭エントリの開始位置、なければ生のカーソル位置）を
    /// [`ByteOffset`] にラップして返す。パース処理の副作用は伴わない。
    pub fn position(&self) -> ByteOffset {
        ByteOffset::new(self.lexer.position() as u64)
    }

    /// 次のオブジェクトを 1 つ読み取る。
    ///
    /// スカラ 7 種に加え [`Token::ArrayBegin`] を検出した場合は配列パスに分岐し
    /// [`PdfObject::Array`] を、[`Token::DictBegin`] を検出した場合は辞書パスに分岐し
    /// [`PdfObject::Dictionary`] を構築する。[`Token::Comment`] は透過的にスキップする。
    /// `Integer(N)` を読んだ直後は `try_parse_indirect_reference` で
    /// 最大 2 トークン先読みし、`N G R` パターンが成立すれば `N >= 1` なら
    /// [`PdfObject::Reference`]、`N == 0` なら [`PdfObject::Null`] を返す
    /// （ISO 32000-1 §7.3.10 / §7.5.4）。不成立のときは Integer として通常通り返す。
    /// `obj`/`endobj`/`stream`/`endstream`・キーワード等の対象外トークンが来た場合は
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// 入力が尽きていれば [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が [`LexOutcome::Malformed`] を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を返す。
    pub fn parse_object(&mut self) -> Result<PdfObject, ParseError> {
        let (token, pos_before) = self.take_token_or_error()?;

        match token {
            Token::Primitive(Primitive::Integer(n)) => {
                if let Some(object) = self.try_parse_indirect_reference(n)? {
                    return Ok(object);
                }
                Ok(PdfObject::Integer(n))
            }
            Token::Primitive(p) => Ok(Self::primitive_to_object(p)),
            Token::ArrayBegin => self.parse_array_body(),
            Token::DictBegin => self.parse_dictionary_body(),
            other => Err(ParseError::unexpected_token_at(
                ByteOffset::new(pos_before as u64),
                other.kind(),
            )),
        }
    }

    /// 間接オブジェクト定義 `N G obj <content> endobj` を 1 つ読み取り
    /// [`IndirectObject`] を返す（ISO 32000-1 §7.3.10）。
    ///
    /// 消費型の専用エントリ。ヘッダ `Integer(N) Integer(G) ObjBegin` を順に消費し
    /// （`N` / `G` は [`ObjectNumber`] / [`GenerationNumber`] へ変換できることを検証済み）、
    /// content を [`Self::parse_object`] で 1 回読み、最後に `endobj`（[`Token::ObjEnd`]）を
    /// 要求する。ヘッダ/`endobj`
    /// 位置が期待形でなければ
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// 入力が尽きれば
    /// [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が malformed を検知した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を返す。
    /// オブジェクト番号が正整数（ISO 32000-1 §7.3.10）であることは
    /// [`ObjectNumber`] の構築時に検証され、`0 G obj` は
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)
    /// になる（#334）。参照先の存在・世代の照合など、xref を要する検証は
    /// 引き続き上位レイヤの責務。
    pub fn parse_indirect_object(&mut self) -> Result<IndirectObject, ParseError> {
        let object_number = self.take_object_number()?;
        let generation = self.take_generation_number()?;
        self.expect_token(&Token::ObjBegin)?;
        let object = self.parse_object_or_stream()?;
        self.expect_token(&Token::ObjEnd)?;
        let id = ObjectId::new(object_number, generation);
        Ok(IndirectObject::new(id, object))
    }

    /// `parse_object` の結果が [`PdfObject::Dictionary`] の場合のみ、直後に stream が
    /// 続くかを試して昇格する。間接オブジェクト内でのみ呼ぶ（DC-7 でトップレベル
    /// [`Self::parse_object`] は既存挙動を維持）。
    ///
    /// `peek_token_with_pos` で次トークンをバッファへ載せてから `position()` を取ることで、
    /// content 直前の whitespace / comment を飛ばしたあとの実トークン開始位置（辞書なら `<<` の pos）
    /// を `dict_start` として `parse_stream_object` に渡す（DC-5）。
    fn parse_object_or_stream(&mut self) -> Result<PdfObject, ParseError> {
        let dict_start = match self.lexer.peek_token_with_pos() {
            LexOutcome::Lexed((_, pos)) => ByteOffset::new(pos as u64),
            // EOF / malformed のどちらでも直後の parse_object() が正しいエラーを返すため、
            // この dict_start は実際には使われない。両者を区別せず生カーソル位置を
            // フォールバックとして使う（従来の None 分岐と同じ振る舞い）。
            LexOutcome::Eof | LexOutcome::Malformed { .. } => {
                ByteOffset::new(self.lexer.cursor_position() as u64)
            }
        };
        let obj = self.parse_object()?;
        match obj {
            PdfObject::Dictionary(dict) => self.parse_stream_object(dict, dict_start),
            other => Ok(other),
        }
    }

    /// ヘッダ先頭の N を消費し、検証済みの [`ObjectNumber`] として返す。
    ///
    /// `Integer(N)` かつ [`ObjectNumber::try_from_i64`] が `Some` を返す（= `N >= 1`）
    /// 場合のみ受理する。非 Integer / 範囲外はどちらも
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)
    /// （範囲外でも token 自体は有効な `Primitive` のため `actual` は `TokenKind::Primitive`）、
    /// EOF / malformed は [`Self::take_token_or_error`] 経由で区別して返す。
    /// 範囲検証とキャストは `ObjectNumber` 側に閉じており、ここには `as` が無い。
    fn take_object_number(&mut self) -> Result<ObjectNumber, ParseError> {
        let (token, pos_before) = self.take_token_or_error()?;
        // 範囲外の Integer も「有効な Primitive が来た」として報告する契約のため、
        // 種別は match の前に 1 度だけ求めて両腕で共有する（TokenKind は Copy）。
        let kind = token.kind();
        let position = ByteOffset::new(pos_before as u64);
        match token {
            Token::Primitive(Primitive::Integer(n)) => ObjectNumber::try_from_i64(n)
                .ok_or_else(|| ParseError::unexpected_token_at(position, kind)),
            _ => Err(ParseError::unexpected_token_at(position, kind)),
        }
    }

    /// ヘッダ 2 番目の G を消費し、検証済みの [`GenerationNumber`] として返す。
    ///
    /// `Integer(G)` かつ [`GenerationNumber::try_from_i64`] が `Some` を返す
    /// （= `0 <= G <= u16::MAX`）場合のみ受理する。エラーの扱いは
    /// [`Self::take_object_number`] と同一。
    fn take_generation_number(&mut self) -> Result<GenerationNumber, ParseError> {
        let (token, pos_before) = self.take_token_or_error()?;
        let kind = token.kind();
        let position = ByteOffset::new(pos_before as u64);
        match token {
            Token::Primitive(Primitive::Integer(g)) => GenerationNumber::try_from_i64(g)
                .ok_or_else(|| ParseError::unexpected_token_at(position, kind)),
            _ => Err(ParseError::unexpected_token_at(position, kind)),
        }
    }

    /// 取得済みトークンが `expected` と等価であることを要求して消費する。
    ///
    /// `obj`（[`Token::ObjBegin`]）/ `endobj`（[`Token::ObjEnd`]）要求を 1 本化した
    /// 汎用 helper。両ステップは骨格が同一（`take_token_or_error` → unit トークン判定 →
    /// 不一致で `Token::kind` + `unexpected_token_at`）のため DRY 化する。`expected` は
    /// unit variant を想定し、取得済みトークンとの `==`（`Token: PartialEq`）で等価判定する。
    /// 不一致は
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// EOF / malformed は [`Self::take_token_or_error`] 経由で区別して返す。
    fn expect_token(&mut self, expected: &Token) -> Result<(), ParseError> {
        let (token, pos_before) = self.take_token_or_error()?;
        if &token == expected {
            Ok(())
        } else {
            Err(ParseError::unexpected_token_at(
                ByteOffset::new(pos_before as u64),
                token.kind(),
            ))
        }
    }

    /// `[` を消費済の状態から配列ボディをパースし [`PdfObject::Array`] を返す
    /// （ISO 32000-1 §7.3.6）。要素間 [`Token::Comment`] は `Lexer::take_token_with_pos`
    /// の中で透過スキップ、[`Token::Primitive`] は所有ムーブで [`PdfObject`] に変換して
    /// `items` に push、[`Token::ArrayBegin`] はネストとして自身を再帰呼び出しし、
    /// [`Token::DictBegin`] は辞書要素として [`Self::parse_dictionary_body`] を
    /// 再帰呼び出しする。Integer 要素は `try_parse_indirect_reference` を介して
    /// 後続 `Integer Keyword(Keyword::R)` を検出すれば [`PdfObject::Reference`] として push、
    /// 不成立なら [`PdfObject::Integer`] として push する（ISO 32000-1 §7.3.10）。
    /// [`Token::ArrayEnd`] でループを脱出する。対象外トークンは
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// `]` 不在で入力が尽きた場合は
    /// [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が [`LexOutcome::Malformed`] を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を fail-fast で返す。
    fn parse_array_body(&mut self) -> Result<PdfObject, ParseError> {
        let mut items: Vec<PdfObject> = Vec::new();
        loop {
            let (token, pos_before) = self.take_token_or_error()?;
            match token {
                Token::ArrayEnd => return Ok(PdfObject::Array(items)),
                Token::Primitive(Primitive::Integer(n)) => {
                    let item = match self.try_parse_indirect_reference(n)? {
                        Some(object) => object,
                        None => PdfObject::Integer(n),
                    };
                    items.push(item);
                }
                Token::Primitive(p) => items.push(Self::primitive_to_object(p)),
                Token::ArrayBegin => items.push(self.parse_array_body()?),
                Token::DictBegin => items.push(self.parse_dictionary_body()?),
                other => {
                    return Err(ParseError::unexpected_token_at(
                        ByteOffset::new(pos_before as u64),
                        other.kind(),
                    ));
                }
            }
        }
    }

    /// `<<` を消費済の状態から辞書ボディをパースし [`PdfObject::Dictionary`] を返す
    /// （ISO 32000-1 §7.3.7）。エントリ間 [`Token::Comment`] は
    /// `Lexer::take_token_with_pos` の中で透過スキップ、キーは [`Primitive::Name`] のみ受理して所有ムーブで
    /// [`PdfName`] として保持し、値は [`Self::parse_object`] の再帰呼び出しで取得する。
    /// 値読みが `parse_object` 経由のため、間接参照（ISO 32000-1 §7.3.10）は値位置で
    /// 自動的に [`PdfObject::Reference`] として認識される。
    /// 値が [`PdfObject::Null`] の場合は ISO §7.3.7 に従い [`PdfDictionary::remove`]
    /// で既存エントリを削除し未登録状態に正規化する。それ以外は
    /// [`PdfDictionary::insert`] で登録し、重複キーは `BTreeMap` の自動上書きで
    /// 「最後の値を採用」となる。[`Token::DictEnd`] でループを脱出する。
    /// キー位置に Name 以外のトークンが来た場合は
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// `>>` 不在で入力が尽きた場合は
    /// [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が [`LexOutcome::Malformed`] を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を fail-fast で返す。
    ///
    /// [`PdfName`]: crate::object::name::PdfName
    fn parse_dictionary_body(&mut self) -> Result<PdfObject, ParseError> {
        let mut dict = PdfDictionary::new();
        loop {
            let (token, pos_before) = self.take_token_or_error()?;
            match token {
                Token::DictEnd => return Ok(PdfObject::Dictionary(dict)),
                Token::Primitive(Primitive::Name(key)) => {
                    let value = self.parse_object()?;
                    if value.is_null() {
                        let _ = dict.remove(&key);
                    } else {
                        let _ = dict.insert(key, value);
                    }
                }
                other => {
                    return Err(ParseError::unexpected_token_at(
                        ByteOffset::new(pos_before as u64),
                        other.kind(),
                    ));
                }
            }
        }
    }

    /// 次のトークンを Comment 透過込みで取り出し、EOF と malformed を区別して
    /// [`ParseError`] にラップする内部 helper。
    ///
    /// EOF 位置は常に `input.len()` のため [`Lexer::cursor_position`] から取る。
    /// malformed 位置は [`LexOutcome::Malformed`] が運ぶ値をそのまま使う
    /// （不正バイトの先頭位置。[`Lexer::position`] は peek 済みトークンの開始位置を
    /// 返すため一致しない）。
    fn take_token_or_error(&mut self) -> Result<(Token, usize), ParseError> {
        match self.lexer.take_token_with_pos() {
            LexOutcome::Lexed(entry) => Ok(entry),
            LexOutcome::Eof => Err(ParseError::unexpected_eof_at(ByteOffset::new(
                self.lexer.cursor_position() as u64,
            ))),
            LexOutcome::Malformed { position } => {
                Err(ParseError::lexer_error_at(ByteOffset::new(position as u64)))
            }
        }
    }

    /// Integer(N) を読んだ直後に呼び出され、後続が `Integer(G) Keyword(Keyword::R)` で
    /// あるかを最大 2 トークン先読みで検証する（ISO 32000-1 §7.3.10）。
    ///
    /// 成立条件:
    /// - `N` が非負である（負値は番号として表現できないので参照ではない。
    ///   0 はここでは弾かず、成立したうえで null に畳む。後述）
    /// - 次トークンが `Integer(G)` かつ `G` が [`GenerationNumber`] に変換できる
    ///   （[`GenerationNumber::try_from_i64`] が `Some`）
    /// - 次々トークンが `Keyword(Keyword::R)`
    ///
    /// 成立時は `Ok(Some(PdfObject))` を返し、両 lookahead トークンを `take_token`
    /// で 2 回消費する。不成立時は peek 済みトークンを [`Lexer`] のバッファに保留した
    /// まま `Ok(None)` を返す（呼び出し元は Integer(N) として処理し、保留中のトークンは
    /// 次回 `parse_object` 系で透過的に取り出される）。
    ///
    /// 返す `PdfObject` は `N >= 1` なら [`PdfObject::Reference`]、
    /// **`N == 0` なら [`PdfObject::Null`]** になる。オブジェクト番号 0 は ISO 32000-1 §7.5.4 の
    /// フリーリスト先頭に予約された番号であり、`0 G R` は構文としては合法だが解決結果は
    /// 常に null になる（`docs/specs/02a_object_resolution.md` §2.4「type=0 (Free) → null を返却」）。
    /// [`ObjectNumber`] は正整数しか表せないため参照値を構築できず、かつ構文エラーにも
    /// しないので、参照トークン列を消費したうえで null を返す（#334）。
    /// 関数名は「参照の読み取り試行」のままだが、返り値には null が含まれる点に注意
    /// （改名は #334 の差分を不必要に広げるため見送った）。
    ///
    /// `N` は呼び出し元で `Token::Primitive(Primitive::Integer)` として既に成立済み
    /// （i64 範囲外の N は lexer が `Keyword::Unknown` 化するため、ここには `Integer` のみ届く）。
    ///
    /// lookahead 中に lexer malformed が検出された場合は `Err(LexerError)` を
    /// fail-fast で伝播する。エラー位置は [`LexOutcome::Malformed`] が運ぶ `position`
    /// （バッファを無視した生のカーソル位置）をそのまま使う。`Lexer::position` だと
    /// peek 済みトークンの開始位置が返るため、malformed バイト位置と一致しない。
    fn try_parse_indirect_reference(&mut self, n: i64) -> Result<Option<PdfObject>, ParseError> {
        // 負の N は番号として表現できないので参照ではない。lookahead を始める前に打ち切る
        // （0 はここでは弾かない。R まで成立すれば null 参照として消費するため）。
        let Ok(raw_number) = u64::try_from(n) else {
            return Ok(None);
        };

        let g = match Self::classify_indirect_ref_generation(self.lexer.peek_token_at(0)) {
            PeekClass::Match(g) => g,
            // EOF は「参照ではなかった」として Integer(N) 扱いに戻す（従来どおり）。
            PeekClass::Mismatch | PeekClass::Eof => return Ok(None),
            PeekClass::Malformed { position } => {
                return Err(ParseError::lexer_error_at(ByteOffset::new(position as u64)))
            }
        };
        // G が仕様範囲外なら参照ではない。peek 済みトークンは take せず保留のまま返す。
        let Some(generation) = GenerationNumber::try_from_i64(g) else {
            return Ok(None);
        };

        match Self::classify_indirect_ref_keyword(self.lexer.peek_token_at(1)) {
            PeekClass::Match(()) => {}
            PeekClass::Mismatch | PeekClass::Eof => return Ok(None),
            PeekClass::Malformed { position } => {
                return Err(ParseError::lexer_error_at(ByteOffset::new(position as u64)))
            }
        }

        let _ = self.lexer.take_token();
        let _ = self.lexer.take_token();

        let Some(number) = ObjectNumber::new(raw_number) else {
            return Ok(Some(PdfObject::Null));
        };

        Ok(Some(PdfObject::Reference(IndirectRef::new(ObjectId::new(
            number, generation,
        )))))
    }

    fn classify_indirect_ref_generation(peeked: LexOutcome<&Token>) -> PeekClass<i64> {
        match peeked {
            LexOutcome::Lexed(Token::Primitive(Primitive::Integer(g))) => PeekClass::Match(*g),
            LexOutcome::Lexed(_) => PeekClass::Mismatch,
            LexOutcome::Eof => PeekClass::Eof,
            LexOutcome::Malformed { position } => PeekClass::Malformed { position },
        }
    }

    fn classify_indirect_ref_keyword(peeked: LexOutcome<&Token>) -> PeekClass<()> {
        match peeked {
            LexOutcome::Lexed(Token::Keyword(Keyword::R)) => PeekClass::Match(()),
            LexOutcome::Lexed(_) => PeekClass::Mismatch,
            LexOutcome::Eof => PeekClass::Eof,
            LexOutcome::Malformed { position } => PeekClass::Malformed { position },
        }
    }

    /// [`Primitive`] を所有ムーブで受け取り、対応する [`PdfObject`] バリアントへ
    /// マップする（スカラ 7 種 → 6 種、`LiteralString`/`HexString` は
    /// `PdfObject::String` に集約し、字句の出自は `PdfString` の `encoding` に
    /// 引き継ぐ）。`Vec<u8>` / `PdfName` は clone せずムーブする。
    fn primitive_to_object(p: Primitive) -> PdfObject {
        match p {
            Primitive::Null => PdfObject::Null,
            Primitive::Boolean(b) => PdfObject::Boolean(b),
            Primitive::Integer(i) => PdfObject::Integer(i),
            Primitive::Real(f) => PdfObject::Real(f),
            Primitive::LiteralString(v) => PdfObject::String(PdfString::literal(v)),
            Primitive::HexString(v) => PdfObject::String(PdfString::hex(v)),
            Primitive::Name(n) => PdfObject::Name(n),
        }
    }
}

#[cfg(test)]
mod array_tests;

#[cfg(test)]
mod dictionary_tests;

#[cfg(test)]
mod indirect_object_tests;

#[cfg(test)]
mod indirect_reference_tests;

#[cfg(test)]
mod stream_object_tests;

#[cfg(test)]
mod new_at_tests;

#[cfg(test)]
mod tests {
    use super::*;
    use crate::lexer::token_kind::TokenKind;
    use crate::object::name::PdfName;
    use crate::parser::error::ParseErrorKind;

    fn parser(input: &[u8]) -> Parser<'_> {
        Parser::new(input)
    }

    // ---------- Parser::new / Parser::position ----------

    #[test]
    fn new_then_position_returns_zero() {
        // Parser::new 直後の position() が ByteOffset::new(0) を返すことを確認する
        let p = parser(b"42");
        assert_eq!(p.position(), ByteOffset::new(0));
    }

    #[test]
    fn parse_object_advances_position() {
        // 1 オブジェクト parse 後の position() がカーソル前進していること（>0）を確認する
        let mut p = parser(b"42");
        let _ = p.parse_object().expect("integer should parse");
        assert!(p.position().value() > 0);
    }

    // ---------- 正常系: Null / Boolean ----------

    #[test]
    fn parse_object_returns_null_for_null_keyword() {
        // 入力 b"null" で parse_object が Ok(PdfObject::Null) を返すことを確認する
        let mut p = parser(b"null");
        assert_eq!(p.parse_object(), Ok(PdfObject::Null));
    }

    #[test]
    fn parse_object_returns_boolean_true_for_true_keyword() {
        // 入力 b"true" で Ok(PdfObject::Boolean(true)) を返すことを確認する
        let mut p = parser(b"true");
        assert_eq!(p.parse_object(), Ok(PdfObject::Boolean(true)));
    }

    #[test]
    fn parse_object_returns_boolean_false_for_false_keyword() {
        // 入力 b"false" で Ok(PdfObject::Boolean(false)) を返すことを確認する
        let mut p = parser(b"false");
        assert_eq!(p.parse_object(), Ok(PdfObject::Boolean(false)));
    }

    // ---------- 正常系: Integer ----------

    #[test]
    fn parse_object_returns_integer_for_positive_digits() {
        // 入力 b"42" で Ok(PdfObject::Integer(42)) を返すことを確認する
        let mut p = parser(b"42");
        assert_eq!(p.parse_object(), Ok(PdfObject::Integer(42)));
    }

    #[test]
    fn parse_object_returns_integer_for_negative_digits() {
        // 入力 b"-7" で Ok(PdfObject::Integer(-7)) を返すことを確認する
        let mut p = parser(b"-7");
        assert_eq!(p.parse_object(), Ok(PdfObject::Integer(-7)));
    }

    #[test]
    fn parse_object_returns_integer_for_zero() {
        // 境界値: 入力 b"0" で Ok(PdfObject::Integer(0)) を返すことを確認する
        let mut p = parser(b"0");
        assert_eq!(p.parse_object(), Ok(PdfObject::Integer(0)));
    }

    #[test]
    fn parse_object_returns_integer_for_i64_max() {
        // 境界値: i64::MAX を表す入力で Integer(i64::MAX) を透過保持することを確認する
        let mut p = parser(b"9223372036854775807");
        assert_eq!(p.parse_object(), Ok(PdfObject::Integer(i64::MAX)));
    }

    #[test]
    fn parse_object_returns_integer_for_i64_min() {
        // 境界値: i64::MIN を表す入力で Integer(i64::MIN) を透過保持することを確認する
        let mut p = parser(b"-9223372036854775808");
        assert_eq!(p.parse_object(), Ok(PdfObject::Integer(i64::MIN)));
    }

    // ---------- 正常系: Real ----------

    #[test]
    fn parse_object_returns_real_for_decimal() {
        // 入力 b"1.25" で Ok(PdfObject::Real(1.25)) を返すことを確認する
        let mut p = parser(b"1.25");
        assert_eq!(p.parse_object(), Ok(PdfObject::Real(1.25)));
    }

    #[test]
    fn parse_object_returns_real_for_leading_dot() {
        // 入力 b".5" で Ok(PdfObject::Real(0.5)) を返すことを確認する
        let mut p = parser(b".5");
        assert_eq!(p.parse_object(), Ok(PdfObject::Real(0.5)));
    }

    #[test]
    fn parse_object_returns_real_for_trailing_dot() {
        // 入力 b"5." で Ok(PdfObject::Real(5.0)) を返すことを確認する
        let mut p = parser(b"5.");
        assert_eq!(p.parse_object(), Ok(PdfObject::Real(5.0)));
    }

    // ---------- 内部ヘルパ: primitive_to_object（NaN / Inf 透過） ----------

    #[test]
    fn primitive_to_object_preserves_real_nan() {
        // Primitive::Real(NaN) を内部ヘルパで変換すると PdfObject::Real(NaN) として保持されることを確認する
        let obj = Parser::primitive_to_object(Primitive::Real(f64::NAN));
        match obj {
            PdfObject::Real(f) => assert!(f.is_nan()),
            _ => panic!("expected Real(NaN), got {:?}", obj),
        }
    }

    #[test]
    fn primitive_to_object_preserves_real_positive_infinity() {
        // Primitive::Real(+Inf) を内部ヘルパで変換すると PdfObject::Real(+Inf) として保持されることを確認する
        let obj = Parser::primitive_to_object(Primitive::Real(f64::INFINITY));
        match obj {
            PdfObject::Real(f) => assert!(f.is_infinite() && f.is_sign_positive()),
            _ => panic!("expected Real(+Inf), got {:?}", obj),
        }
    }

    #[test]
    fn primitive_to_object_preserves_real_negative_infinity() {
        // Primitive::Real(-Inf) を内部ヘルパで変換すると PdfObject::Real(-Inf) として保持されることを確認する
        let obj = Parser::primitive_to_object(Primitive::Real(f64::NEG_INFINITY));
        match obj {
            PdfObject::Real(f) => assert!(f.is_infinite() && f.is_sign_negative()),
            _ => panic!("expected Real(-Inf), got {:?}", obj),
        }
    }

    // ---------- 正常系: String（LiteralString / HexString → PdfObject::String） ----------

    #[test]
    fn parse_object_returns_string_for_literal_string() {
        // 入力 b"(hello)" で Ok(PdfObject::String(PdfString::literal(b"hello"))) を返すことを確認する
        let mut p = parser(b"(hello)");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::String(PdfString::literal(b"hello")))
        );
    }

    #[test]
    fn parse_object_returns_empty_string_for_empty_literal() {
        // 境界値: 入力 b"()" で空の String(PdfString::literal(Vec::new())) を返すことを確認する
        let mut p = parser(b"()");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::String(PdfString::literal(Vec::new())))
        );
    }

    #[test]
    fn parse_object_returns_string_with_nul_byte_for_literal() {
        // エッジ: NUL バイトを含むリテラル文字列を忠実に保持することを確認する
        let mut p = parser(b"(a\0b)");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::String(PdfString::literal(vec![
                b'a', 0x00, b'b'
            ])))
        );
    }

    #[test]
    fn parse_object_returns_string_for_hex_string() {
        // 入力 b"<48656C6C6F>" で Ok(PdfObject::String(PdfString::hex(b"Hello"))) を返すことを確認する
        let mut p = parser(b"<48656C6C6F>");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::String(PdfString::hex(b"Hello")))
        );
    }

    #[test]
    fn parse_object_returns_empty_string_for_empty_hex() {
        // 境界値: 入力 b"<>" で空の String(PdfString::hex(Vec::new())) を返すことを確認する
        let mut p = parser(b"<>");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::String(PdfString::hex(Vec::new())))
        );
    }

    #[test]
    fn literal_and_hex_with_same_bytes_are_not_equal() {
        // 同じバイト列にデコードされる "(Hello)" と "<48656C6C6F>" のパース結果が
        // encoding の違いで非等価になることを確認する
        let mut literal = parser(b"(Hello)");
        let mut hex = parser(b"<48656C6C6F>");
        assert_ne!(literal.parse_object(), hex.parse_object());
    }

    // ---------- 正常系: Name ----------

    #[test]
    fn parse_object_returns_name_for_simple_name() {
        // 入力 b"/Type" で Ok(PdfObject::Name(PdfName::new("Type"))) を返すことを確認する
        let mut p = parser(b"/Type");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::Name(PdfName::new(b"Type".to_vec())))
        );
    }

    #[test]
    fn parse_object_returns_empty_name_for_slash_only() {
        // 境界値: 入力 b"/" で空の Name(PdfName::new(Vec::new())) を返すことを確認する
        let mut p = parser(b"/");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::Name(PdfName::new(Vec::new())))
        );
    }

    #[test]
    fn parse_object_returns_name_with_hex_escape() {
        // エッジ: #20 エスケープを含む /A#20B が lexer で解決された "A B" バイト列を Name として保持することを確認する
        let mut p = parser(b"/A#20B");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::Name(PdfName::new(b"A B".to_vec())))
        );
    }

    // ---------- 異常系: UnexpectedEof ----------

    #[test]
    fn parse_object_returns_unexpected_eof_for_empty_input() {
        // 空入力で parse_object が UnexpectedEof を返すことを確認する
        let mut p = parser(b"");
        let err = p.parse_object().expect_err("empty input must error");
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    }

    #[test]
    fn parse_object_returns_unexpected_eof_after_consuming_all_tokens() {
        // 1 つ parse 成功した後の 2 回目で UnexpectedEof が返ることを確認する
        let mut p = parser(b"42");
        let _ = p.parse_object().expect("first call succeeds");
        let err = p.parse_object().expect_err("second call must error");
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    }

    #[test]
    fn parse_object_returns_unexpected_eof_for_unclosed_array_begin() {
        // 入力 b"[" で配列パスに入った結果 `]` 不在 EOF として UnexpectedEof を返すことを確認する
        let mut p = parser(b"[");
        let err = p.parse_object().expect_err("unclosed array must error");
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    }

    // ---------- 異常系: UnexpectedToken ----------

    #[test]
    fn parse_object_returns_unexpected_token_for_array_end() {
        // 入力 b"]" で UnexpectedToken { actual: TokenKind::ArrayEnd } を返すことを確認する
        let mut p = parser(b"]");
        let err = p.parse_object().expect_err("array end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::ArrayEnd
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_dict_end() {
        // 入力 b">>" で UnexpectedToken { actual: TokenKind::DictEnd } を返すことを確認する
        let mut p = parser(b">>");
        let err = p.parse_object().expect_err("dict end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::DictEnd
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_obj_begin() {
        // 入力 b"obj" で UnexpectedToken { actual: TokenKind::ObjBegin } を返すことを確認する
        let mut p = parser(b"obj");
        let err = p.parse_object().expect_err("obj begin must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::ObjBegin
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_obj_end() {
        // 入力 b"endobj" で UnexpectedToken { actual: TokenKind::ObjEnd } を返すことを確認する
        let mut p = parser(b"endobj");
        let err = p.parse_object().expect_err("obj end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::ObjEnd
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_stream_begin() {
        // 入力 b"stream" で UnexpectedToken { actual: TokenKind::StreamBegin } を返すことを確認する
        let mut p = parser(b"stream");
        let err = p.parse_object().expect_err("stream begin must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::StreamBegin
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_stream_end() {
        // 入力 b"endstream" で UnexpectedToken { actual: TokenKind::StreamEnd } を返すことを確認する
        let mut p = parser(b"endstream");
        let err = p.parse_object().expect_err("stream end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::StreamEnd
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_keyword_r() {
        // 入力 b"R" で UnexpectedToken { actual: TokenKind::Keyword } を返すことを確認する
        let mut p = parser(b"R");
        let err = p.parse_object().expect_err("keyword R must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::Keyword
            }
        );
    }

    // ---------- 異常系: LexerError ----------

    #[test]
    fn parse_object_returns_lexer_error_for_unterminated_hex() {
        // 入力 b"<48656C"（閉じ '>' のない hex string）で LexerError と pos=0 を返すことを確認する
        let mut p = parser(b"<48656C");
        let err = p.parse_object().expect_err("unterminated hex must error");
        assert_eq!(err.kind, ParseErrorKind::LexerError);
        assert_eq!(err.position, ByteOffset::new(0));
    }

    // ---------- Comment 透過スキップ ----------

    #[test]
    fn parse_object_skips_single_comment_and_returns_following_scalar() {
        // 入力 b"% comment\nnull" で先頭コメントを透過スキップし Ok(Null) を返すことを確認する
        let mut p = parser(b"% comment\nnull");
        assert_eq!(p.parse_object(), Ok(PdfObject::Null));
    }

    #[test]
    fn parse_object_skips_multiple_consecutive_comments() {
        // 入力 b"%a\n%b\n%c\ntrue" で 3 行の連続コメントを透過スキップし Ok(Boolean(true)) を返すことを確認する
        let mut p = parser(b"%a\n%b\n%c\ntrue");
        assert_eq!(p.parse_object(), Ok(PdfObject::Boolean(true)));
    }

    #[test]
    fn parse_object_returns_unexpected_eof_after_only_comments() {
        // 入力 b"% only comment\n" のように Comment しかない入力で最終的に UnexpectedEof を返すことを確認する
        let mut p = parser(b"% only comment\n");
        let err = p.parse_object().expect_err("comment-only input must error");
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    }

    // ---------- panic 不在 ----------

    #[test]
    fn parse_object_returns_unexpected_eof_for_nul_only_bytes() {
        // NUL は whitespace 分類のため skip_whitespace で消費 → EOF → UnexpectedEof, position=3 で panic しないことを確認する
        let mut p = parser(&[0x00, 0x00, 0x00]);
        let err = p.parse_object().expect_err("nul-only input must error");
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
        assert_eq!(err.position, ByteOffset::new(3));
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_control_chars() {
        // 制御文字（regular 分類）は read_keyword で Token::Keyword になり UnexpectedToken { "Keyword" } を返すことを確認する
        let mut p = parser(&[0x01, 0x02, 0x07, 0x1F]);
        let err = p
            .parse_object()
            .expect_err("control bytes must error as keyword");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::Keyword
            }
        );
        assert_eq!(err.position, ByteOffset::new(0));
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_high_bytes() {
        // 高位バイト（regular 分類）も Keyword 経路で UnexpectedToken { "Keyword" } を返すことを確認する
        let mut p = parser(&[0xFF, 0xFE, 0xCA, 0xFE]);
        let err = p
            .parse_object()
            .expect_err("high bytes must error as keyword");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual: TokenKind::Keyword
            }
        );
        assert_eq!(err.position, ByteOffset::new(0));
    }
}
