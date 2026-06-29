//! PDF オブジェクトのパース層。
//!
//! lexer が返す [`Token`](crate::lexer::token::Token) を ISO 32000-1 §7.3 の
//! オブジェクトに意味付けして [`PdfObject`] に変換する。本モジュールは
//! スカラ 7 種（Null / Boolean / Integer / Real / LiteralString / HexString /
//! Name）・配列（ISO §7.3.6）・辞書（ISO §7.3.7、`PdfDictionary` を内包）・
//! 間接参照（ISO §7.3.10、`PdfObject::Reference`）を扱い、配列/辞書は要素/値に
//! 配列・辞書・間接参照を含むネストを再帰的にサポートする。stream は対象外。
//!
//! `LiteralString` と `HexString` は出自情報を落として `PdfObject::String` に統合する
//! （所有ムーブのため clone は発生しない）。`Token::Comment` は透過的にスキップする。
//! 辞書のキーは `Primitive::Name` のみ受理、値が `Null` のエントリは ISO §7.3.7 準拠で
//! `PdfDictionary` に登録しない（重複キーで既存値がある場合は削除する）。
//!
//! 間接参照は `Integer(N) Integer(G) Keyword("R")` の 3 トークン列を Parser 内の
//! lookahead バッファ（最大 2 トークン）で検出する。`N >= 0` かつ `0 <= G <= u16::MAX`
//! のときのみ発火し、`N` を [`PdfObject::Reference`] に格納する。不成立時は呼び出し元で
//! `N` を [`PdfObject::Integer`] として発行し、先読み済みの `G` や `Token3` はバッファに
//! 戻してそのまま後続パスで再解釈される（ISO 32000-1 §7.3.10）。

pub mod error;

use std::collections::VecDeque;

use crate::byte_offset::ByteOffset;
use crate::lexer::token::{Primitive, Token};
use crate::lexer::Lexer;
use crate::object::dictionary::PdfDictionary;
use crate::object::generation_number::GenerationNumber;
use crate::object::indirect_ref::IndirectRef;
use crate::object::object_id::ObjectId;
use crate::object::object_number::ObjectNumber;
use crate::object::pdf_object::PdfObject;
use crate::parser::error::ParseError;

/// 先読みしたが消費されなかったトークンと、その読み始めバイト位置を保持する内部用構造体。
///
/// `try_parse_indirect_reference` で lookahead を失敗判定したときに使われ、
/// `pos` はバッファから再取得されたトークンの位置情報として
/// `parse_object` / `parse_array_body` / `parse_dictionary_body` のエラー位置に利用される。
#[derive(Debug)]
struct BufferedToken {
    token: Token,
    pos: usize,
}

/// PDF バイト列から [`PdfObject`] を 1 つずつ取り出すパーサ。
///
/// 内部に [`Lexer`] をムーブで保持し、カーソル位置の管理を委譲する。
/// 加えて、間接参照（`N G R`）の lookahead 用に最大 2 トークンの FIFO
/// バッファ `buffer: VecDeque<BufferedToken>` を保持する。バッファは
/// `try_parse_indirect_reference` が R 不在を判定したときにのみ
/// 一時的に格納され、通常パスでは空のままになる。
///
/// [`Primitive`] の所有データは [`PdfObject`] にそのままムーブし、`Vec<u8>`
/// の clone は行わない。新たな割り当ては `buffer` に最大 2 トークン分の
/// [`BufferedToken`] が積まれるときに限り発生する（`VecDeque::new()` は
/// 容量 0 で開始するため、lookahead がバックトラックを起こさない通常パス
/// では割り当ても発生しない）。
///
/// 任意の入力に対して panic しない契約を持つ（lexer の契約をそのまま継承）。
#[derive(Debug)]
pub struct Parser<'a> {
    lexer: Lexer<'a>,
    buffer: VecDeque<BufferedToken>,
}

impl<'a> Parser<'a> {
    /// 入力バイト列から新しいパーサを構築する。`pos` は 0 で初期化される。
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            lexer: Lexer::new(input),
            buffer: VecDeque::new(),
        }
    }

    /// 現在の論理カーソル位置をバイトオフセットで返す。
    ///
    /// lookahead バッファに保留中のトークンがあればその先頭の読み始め位置を、
    /// なければ内部 [`Lexer`] の `position()` を [`ByteOffset`] にラップして返す。
    /// パース処理の副作用は伴わない。
    pub fn position(&self) -> ByteOffset {
        let pos = self
            .buffer
            .front()
            .map(|b| b.pos)
            .unwrap_or_else(|| self.lexer.position());
        ByteOffset::new(pos as u64)
    }

    /// 次のオブジェクトを 1 つ読み取る。
    ///
    /// スカラ 7 種に加え [`Token::ArrayBegin`] を検出した場合は配列パスに分岐し
    /// [`PdfObject::Array`] を、[`Token::DictBegin`] を検出した場合は辞書パスに分岐し
    /// [`PdfObject::Dictionary`] を構築する。[`Token::Comment`] は透過的にスキップする。
    /// `Integer(N)` を読んだ直後は `try_parse_indirect_reference` で
    /// 最大 2 トークン先読みし、`N G R` パターンが成立すれば [`PdfObject::Reference`] を返す
    /// （ISO 32000-1 §7.3.10）。不成立のときは Integer として通常通り返す。
    /// `obj`/`endobj`/`stream`/`endstream`・キーワード等の対象外トークンが来た場合は
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// 入力が尽きていれば [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が malformed を検知して `None` を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を返す。
    pub fn parse_object(&mut self) -> Result<PdfObject, ParseError> {
        let (token, pos_before) = match self.next_token_with_pos()? {
            Some(p) => p,
            None => {
                return Err(ParseError::unexpected_eof_at(ByteOffset::new(
                    self.lexer.position() as u64,
                )));
            }
        };

        match token {
            Token::Primitive(Primitive::Integer(n)) => {
                if let Some(refr) = self.try_parse_indirect_reference(n)? {
                    return Ok(PdfObject::Reference(refr));
                }
                Ok(PdfObject::Integer(n))
            }
            Token::Primitive(p) => Ok(Self::primitive_to_object(p)),
            Token::ArrayBegin => self.parse_array_body(),
            Token::DictBegin => self.parse_dictionary_body(),
            other => Err(ParseError::unexpected_token_at(
                ByteOffset::new(pos_before as u64),
                Self::token_kind_label(&other),
            )),
        }
    }

    /// `[` を消費済の状態から配列ボディをパースし [`PdfObject::Array`] を返す
    /// （ISO 32000-1 §7.3.6）。要素間 [`Token::Comment`] は `next_token_with_pos` の
    /// 中で透過スキップ、[`Token::Primitive`] は所有ムーブで [`PdfObject`] に変換して
    /// `items` に push、[`Token::ArrayBegin`] はネストとして自身を再帰呼び出しし、
    /// [`Token::DictBegin`] は辞書要素として [`Self::parse_dictionary_body`] を
    /// 再帰呼び出しする。Integer 要素は `try_parse_indirect_reference` を介して
    /// 後続 `Integer Keyword("R")` を検出すれば [`PdfObject::Reference`] として push、
    /// 不成立なら [`PdfObject::Integer`] として push する（ISO 32000-1 §7.3.10）。
    /// [`Token::ArrayEnd`] でループを脱出する。対象外トークンは
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// `]` 不在で入力が尽きた場合は
    /// [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が malformed を検知して `None` を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を fail-fast で返す。
    fn parse_array_body(&mut self) -> Result<PdfObject, ParseError> {
        let mut items: Vec<PdfObject> = Vec::new();
        loop {
            let (token, pos_before) = match self.next_token_with_pos()? {
                Some(p) => p,
                None => {
                    return Err(ParseError::unexpected_eof_at(ByteOffset::new(
                        self.lexer.position() as u64,
                    )));
                }
            };
            match token {
                Token::ArrayEnd => return Ok(PdfObject::Array(items)),
                Token::Primitive(Primitive::Integer(n)) => {
                    let item = match self.try_parse_indirect_reference(n)? {
                        Some(refr) => PdfObject::Reference(refr),
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
                        Self::token_kind_label(&other),
                    ));
                }
            }
        }
    }

    /// `<<` を消費済の状態から辞書ボディをパースし [`PdfObject::Dictionary`] を返す
    /// （ISO 32000-1 §7.3.7）。エントリ間 [`Token::Comment`] は `next_token_with_pos`
    /// の中で透過スキップ、キーは [`Primitive::Name`] のみ受理して所有ムーブで
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
    /// lexer が malformed を検知して `None` を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を fail-fast で返す。
    ///
    /// [`PdfName`]: crate::object::name::PdfName
    fn parse_dictionary_body(&mut self) -> Result<PdfObject, ParseError> {
        let mut dict = PdfDictionary::new();
        loop {
            let (token, pos_before) = match self.next_token_with_pos()? {
                Some(p) => p,
                None => {
                    return Err(ParseError::unexpected_eof_at(ByteOffset::new(
                        self.lexer.position() as u64,
                    )));
                }
            };
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
                        Self::token_kind_label(&other),
                    ));
                }
            }
        }
    }

    /// バッファが空ならば lexer から次の non-comment トークンと読み始め位置を取得し、
    /// 非空ならば FIFO で最古のバッファエントリを返す。
    /// EOF（lexer の `next_token()` が `None` かつ入力末端）は `Ok(None)`、lexer が
    /// malformed を検知して `None` を返した場合は `Err(ParseError::lexer_error_at(...))`
    /// を返す。[`Token::Comment`] は透過スキップする（呼び出し元はコメント腕を持たなくてよい）。
    ///
    /// エラー位置は lexer 呼び出し直前に保存した `pos_before` を用いる。これは
    /// 既存の `parse_object` 系の慣習と一貫し、`lexer.position()` の取り回しに
    /// 依存しないロバストな指定方法である。
    fn next_token_with_pos(&mut self) -> Result<Option<(Token, usize)>, ParseError> {
        loop {
            if let Some(buffered) = self.buffer.pop_front() {
                return Ok(Some((buffered.token, buffered.pos)));
            }
            self.lexer.skip_whitespace();
            let pos_before = self.lexer.position();
            match self.lexer.next_token() {
                Some(Token::Comment(_)) => continue,
                Some(token) => return Ok(Some((token, pos_before))),
                None => {
                    if self.lexer.is_eof() {
                        return Ok(None);
                    }
                    return Err(ParseError::lexer_error_at(ByteOffset::new(
                        pos_before as u64,
                    )));
                }
            }
        }
    }

    /// Integer(N) を読んだ直後に呼び出され、後続が `Integer(G) Keyword("R")` で
    /// あるかを最大 2 トークン先読みで検証する（ISO 32000-1 §7.3.10）。
    ///
    /// 成立条件:
    /// - `N >= 0`
    /// - 次トークンが `Integer(G)` かつ `0 <= G <= u16::MAX`
    /// - 次々トークンが `Keyword("R")`
    ///
    /// 成立時は `Ok(Some(IndirectRef))` を返し、両 lookahead トークンを消費する。
    /// 不成立時は読んだトークンを `self.buffer` へ FIFO 順で `push_back` し、
    /// `Ok(None)` を返す（呼び出し元は Integer(N) として処理する）。
    /// `N` は呼び出し元で `Token::Primitive(Primitive::Integer)` として既に成立済み
    /// （i64 範囲外の N は lexer が `Keyword` 化するため、ここには `Integer` のみ届く）。
    ///
    /// lookahead 中に lexer malformed が検出された場合は `Err(LexerError)` を
    /// fail-fast で伝播する。呼び出し元が握っている `N` の値は捨てられる。
    /// 「N を一旦返してから次回呼び出しで Err を発火する」逆案は採用しない
    /// （lookahead を 1 関数で完結させる単純さを優先）。
    fn try_parse_indirect_reference(&mut self, n: i64) -> Result<Option<IndirectRef>, ParseError> {
        if n < 0 {
            return Ok(None);
        }

        let (tok2, pos2) = match self.next_token_with_pos()? {
            Some(t) => t,
            None => return Ok(None),
        };

        let g = match tok2 {
            Token::Primitive(Primitive::Integer(g)) => g,
            other => {
                self.buffer.push_back(BufferedToken {
                    token: other,
                    pos: pos2,
                });
                return Ok(None);
            }
        };

        if !(0..=i64::from(u16::MAX)).contains(&g) {
            self.buffer.push_back(BufferedToken {
                token: Token::Primitive(Primitive::Integer(g)),
                pos: pos2,
            });
            return Ok(None);
        }

        let (tok3, pos3) = match self.next_token_with_pos()? {
            Some(t) => t,
            None => {
                self.buffer.push_back(BufferedToken {
                    token: Token::Primitive(Primitive::Integer(g)),
                    pos: pos2,
                });
                return Ok(None);
            }
        };

        if matches!(&tok3, Token::Keyword(bytes) if bytes.as_slice() == b"R") {
            let id = ObjectId::new(ObjectNumber::new(n as u64), GenerationNumber::new(g as u16));
            return Ok(Some(IndirectRef::new(id)));
        }

        self.buffer.push_back(BufferedToken {
            token: Token::Primitive(Primitive::Integer(g)),
            pos: pos2,
        });
        self.buffer.push_back(BufferedToken {
            token: tok3,
            pos: pos3,
        });
        Ok(None)
    }

    /// [`Primitive`] を所有ムーブで受け取り、対応する [`PdfObject`] バリアントへ
    /// マップする（スカラ 7 種 → 6 種、`LiteralString`/`HexString` は
    /// `PdfObject::String` に統合）。`Vec<u8>` / `PdfName` は clone せずムーブする。
    fn primitive_to_object(p: Primitive) -> PdfObject {
        match p {
            Primitive::Null => PdfObject::Null,
            Primitive::Boolean(b) => PdfObject::Boolean(b),
            Primitive::Integer(i) => PdfObject::Integer(i),
            Primitive::Real(f) => PdfObject::Real(f),
            Primitive::LiteralString(v) => PdfObject::String(v),
            Primitive::HexString(v) => PdfObject::String(v),
            Primitive::Name(n) => PdfObject::Name(n),
        }
    }

    /// 想定外トークンの種別を [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)
    /// の `actual_kind` フィールドに載せる短い `'static` 識別子にマップする。
    fn token_kind_label(token: &Token) -> &'static str {
        match token {
            Token::Primitive(_) => "Primitive",
            Token::ArrayBegin => "ArrayBegin",
            Token::ArrayEnd => "ArrayEnd",
            Token::DictBegin => "DictBegin",
            Token::DictEnd => "DictEnd",
            Token::ObjBegin => "ObjBegin",
            Token::ObjEnd => "ObjEnd",
            Token::StreamBegin => "StreamBegin",
            Token::StreamEnd => "StreamEnd",
            Token::Keyword(_) => "Keyword",
            Token::Comment(_) => "Comment",
        }
    }
}

#[cfg(test)]
mod array_tests;

#[cfg(test)]
mod dictionary_tests;

#[cfg(test)]
mod indirect_reference_tests;

#[cfg(test)]
mod tests {
    use super::*;
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
        // 入力 b"(hello)" で Ok(PdfObject::String(b"hello".to_vec())) を返すことを確認する
        let mut p = parser(b"(hello)");
        assert_eq!(p.parse_object(), Ok(PdfObject::String(b"hello".to_vec())));
    }

    #[test]
    fn parse_object_returns_empty_string_for_empty_literal() {
        // 境界値: 入力 b"()" で空の String(Vec::new()) を返すことを確認する
        let mut p = parser(b"()");
        assert_eq!(p.parse_object(), Ok(PdfObject::String(Vec::new())));
    }

    #[test]
    fn parse_object_returns_string_with_nul_byte_for_literal() {
        // エッジ: NUL バイトを含むリテラル文字列を忠実に保持することを確認する
        let mut p = parser(b"(a\0b)");
        assert_eq!(
            p.parse_object(),
            Ok(PdfObject::String(vec![b'a', 0x00, b'b']))
        );
    }

    #[test]
    fn parse_object_returns_string_for_hex_string() {
        // 入力 b"<48656C6C6F>" で Ok(PdfObject::String(b"Hello".to_vec())) を返すことを確認する
        let mut p = parser(b"<48656C6C6F>");
        assert_eq!(p.parse_object(), Ok(PdfObject::String(b"Hello".to_vec())));
    }

    #[test]
    fn parse_object_returns_empty_string_for_empty_hex() {
        // 境界値: 入力 b"<>" で空の String(Vec::new()) を返すことを確認する
        let mut p = parser(b"<>");
        assert_eq!(p.parse_object(), Ok(PdfObject::String(Vec::new())));
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
        // 入力 b"]" で UnexpectedToken { actual_kind: "ArrayEnd" } を返すことを確認する
        let mut p = parser(b"]");
        let err = p.parse_object().expect_err("array end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "ArrayEnd"
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_dict_end() {
        // 入力 b">>" で UnexpectedToken { actual_kind: "DictEnd" } を返すことを確認する
        let mut p = parser(b">>");
        let err = p.parse_object().expect_err("dict end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "DictEnd"
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_obj_begin() {
        // 入力 b"obj" で UnexpectedToken { actual_kind: "ObjBegin" } を返すことを確認する
        let mut p = parser(b"obj");
        let err = p.parse_object().expect_err("obj begin must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "ObjBegin"
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_obj_end() {
        // 入力 b"endobj" で UnexpectedToken { actual_kind: "ObjEnd" } を返すことを確認する
        let mut p = parser(b"endobj");
        let err = p.parse_object().expect_err("obj end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "ObjEnd"
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_stream_begin() {
        // 入力 b"stream" で UnexpectedToken { actual_kind: "StreamBegin" } を返すことを確認する
        let mut p = parser(b"stream");
        let err = p.parse_object().expect_err("stream begin must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "StreamBegin"
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_stream_end() {
        // 入力 b"endstream" で UnexpectedToken { actual_kind: "StreamEnd" } を返すことを確認する
        let mut p = parser(b"endstream");
        let err = p.parse_object().expect_err("stream end must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "StreamEnd"
            }
        );
    }

    #[test]
    fn parse_object_returns_unexpected_token_for_keyword_r() {
        // 入力 b"R" で UnexpectedToken { actual_kind: "Keyword" } を返すことを確認する
        let mut p = parser(b"R");
        let err = p.parse_object().expect_err("keyword R must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "Keyword"
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
                actual_kind: "Keyword"
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
                actual_kind: "Keyword"
            }
        );
        assert_eq!(err.position, ByteOffset::new(0));
    }
}
