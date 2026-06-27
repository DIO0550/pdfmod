//! PDF オブジェクトのパース層。
//!
//! lexer が返す [`Token`](crate::lexer::token::Token) を ISO 32000-1 §7.3 の
//! オブジェクトに意味付けして [`PdfObject`] に変換する。本モジュールは
//! スカラ 7 種（Null / Boolean / Integer / Real / LiteralString / HexString /
//! Name）と配列（要素はスカラまたは配列）を扱い、辞書・stream・間接参照は対象外。
//!
//! `LiteralString` と `HexString` は出自情報を落として `PdfObject::String` に統合する
//! （所有ムーブのため clone は発生しない）。`Token::Comment` は透過的にスキップする。

pub mod error;

use crate::byte_offset::ByteOffset;
use crate::lexer::token::{Primitive, Token};
use crate::lexer::Lexer;
use crate::object::pdf_object::PdfObject;
use crate::parser::error::ParseError;

/// PDF バイト列から [`PdfObject`] を 1 つずつ取り出すパーサ。
///
/// 内部に [`Lexer`] をムーブで保持し、カーソル位置の管理を委譲する。
/// `Parser` 自身は新たな割り当てを行わず、[`Primitive`] の所有データを
/// [`PdfObject`] にそのままムーブする（`Vec<u8>` の clone を行わない）。
///
/// 任意の入力に対して panic しない契約を持つ（lexer の契約をそのまま継承）。
#[derive(Debug)]
pub struct Parser<'a> {
    lexer: Lexer<'a>,
}

impl<'a> Parser<'a> {
    /// 入力バイト列から新しいパーサを構築する。`pos` は 0 で初期化される。
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            lexer: Lexer::new(input),
        }
    }

    /// 現在のカーソル位置をバイトオフセットで返す。
    ///
    /// 内部 [`Lexer`] の `position()` を [`ByteOffset`] にラップして返すだけで、
    /// パース処理の副作用は伴わない。
    pub fn position(&self) -> ByteOffset {
        ByteOffset::new(self.lexer.position() as u64)
    }

    /// 次のオブジェクトを 1 つ読み取る。
    ///
    /// スカラ 7 種に加え [`Token::ArrayBegin`] を検出した場合は配列パスに分岐し
    /// [`PdfObject::Array`] を構築する。[`Token::Comment`] は透過的にスキップする。
    /// 辞書開始/終了・`obj`/`endobj`/`stream`/`endstream`・キーワード等の対象外
    /// トークンが来た場合は [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// 入力が尽きていれば [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が malformed を検知して `None` を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を返す。
    pub fn parse_object(&mut self) -> Result<PdfObject, ParseError> {
        loop {
            self.lexer.skip_whitespace();
            let pos_before = self.lexer.position();
            match self.lexer.next_token() {
                Some(Token::Comment(_)) => continue,
                Some(Token::Primitive(p)) => return Ok(Self::primitive_to_object(p)),
                Some(Token::ArrayBegin) => return self.parse_array_body(),
                Some(other) => {
                    return Err(ParseError::unexpected_token_at(
                        ByteOffset::new(pos_before as u64),
                        Self::token_kind_label(&other),
                    ));
                }
                None => {
                    let pos = ByteOffset::new(self.lexer.position() as u64);
                    if self.lexer.is_eof() {
                        return Err(ParseError::unexpected_eof_at(pos));
                    }
                    return Err(ParseError::lexer_error_at(pos));
                }
            }
        }
    }

    /// `[` を消費済の状態から配列ボディをパースし [`PdfObject::Array`] を返す
    /// （ISO 32000-1 §7.3.6）。要素間 [`Token::Comment`] は透過スキップ、
    /// [`Token::Primitive`] は所有ムーブで [`PdfObject`] に変換して `items` に
    /// push、[`Token::ArrayBegin`] はネストとして自身を再帰呼び出しする。
    /// [`Token::ArrayEnd`] でループを脱出する。対象外トークンは
    /// [`ParseErrorKind::UnexpectedToken`](error::ParseErrorKind::UnexpectedToken)、
    /// `]` 不在で入力が尽きた場合は
    /// [`ParseErrorKind::UnexpectedEof`](error::ParseErrorKind::UnexpectedEof)、
    /// lexer が malformed を検知して `None` を返した場合は
    /// [`ParseErrorKind::LexerError`](error::ParseErrorKind::LexerError) を fail-fast で返す。
    fn parse_array_body(&mut self) -> Result<PdfObject, ParseError> {
        let mut items: Vec<PdfObject> = Vec::new();
        loop {
            self.lexer.skip_whitespace();
            let pos_before = self.lexer.position();
            match self.lexer.next_token() {
                Some(Token::Comment(_)) => continue,
                Some(Token::ArrayEnd) => return Ok(PdfObject::Array(items)),
                Some(Token::Primitive(p)) => items.push(Self::primitive_to_object(p)),
                Some(Token::ArrayBegin) => items.push(self.parse_array_body()?),
                Some(other) => {
                    return Err(ParseError::unexpected_token_at(
                        ByteOffset::new(pos_before as u64),
                        Self::token_kind_label(&other),
                    ));
                }
                None => {
                    let pos = ByteOffset::new(self.lexer.position() as u64);
                    if self.lexer.is_eof() {
                        return Err(ParseError::unexpected_eof_at(pos));
                    }
                    return Err(ParseError::lexer_error_at(pos));
                }
            }
        }
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

    // ---------- 異常系: UnexpectedToken ----------

    #[test]
    fn parse_object_returns_unexpected_eof_for_unclosed_array_begin() {
        // 入力 b"[" で配列パスに入った結果 `]` 不在 EOF として UnexpectedEof を返すことを確認する
        let mut p = parser(b"[");
        let err = p.parse_object().expect_err("unclosed array must error");
        assert_eq!(err.kind, ParseErrorKind::UnexpectedEof);
    }

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
    fn parse_object_returns_unexpected_token_for_dict_begin() {
        // 入力 b"<<" で UnexpectedToken { actual_kind: "DictBegin" } を返すことを確認する
        let mut p = parser(b"<<");
        let err = p.parse_object().expect_err("dict begin must error");
        assert_eq!(
            err.kind,
            ParseErrorKind::UnexpectedToken {
                actual_kind: "DictBegin"
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
