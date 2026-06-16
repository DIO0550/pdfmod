//! PDF 字句解析（lexer）を構成するモジュール。
//!
//! ISO 32000 のレキシカル規約（`docs/specs/01_lexical_conventions.md`）に基づき、
//! バイト 3 分類（whitespace / delimiter / regular）を表す `ByteKind` と述語関数、
//! および改行（LF / CR / CRLF）を等価に 1 改行として扱う判定関数を提供する。
//! 字句種別を表す `Token` enum およびトークナイザ等の上位機能は本モジュール配下に追加する。
//!
//! 本モジュール直下では、`&'a [u8]` を借用する `Lexer<'a>` 構造体を提供し、
//! カーソル位置の管理（pos）と先読み（peek / peek_at）・前進（advance）・
//! EOF 判定（is_eof）、および ISO 32000 lexical conventions に基づく
//! ホワイトスペース・コメントのスキップ API を提供する。
//! Token 生成（`next_token`）は本モジュールでは扱わず、後続の Tokenize 層に委ねる。
//! 本層は PDF レキシカル層の最下層 API であり、任意の入力・任意の pos に
//! 対して panic しない契約を厳守する（既存 `EolKind::at` と同方針）。

pub mod byte_kind;
pub mod eol;
pub mod token;

use byte_kind::ByteKind;
use eol::EolKind;

/// PDF バイト列を走査するカーソル付き Lexer。
///
/// 入力バイト列を所有せず借用のみ保持するため、割り当てゼロで走査できる。
/// `pos` はバイト先頭からのオフセット（`usize`）であり、`0 ≦ pos ≦ input.len()` を
/// 不変条件として維持する。
///
/// 本構造体はあらゆる API について panic しない契約を持つ。範囲外アクセスは
/// `slice::get` の `Option` で吸収し、`usize` の加算は `checked_add` で扱う。
#[derive(Debug)]
pub struct Lexer<'a> {
    input: &'a [u8],
    pos: usize,
}

impl<'a> Lexer<'a> {
    /// 入力バイト列を借用して新しい `Lexer` を生成する。`pos` は 0 で初期化される。
    pub fn new(input: &'a [u8]) -> Self {
        Self { input, pos: 0 }
    }

    /// 現在の `pos` を返す。
    pub fn position(&self) -> usize {
        self.pos
    }

    /// 現在位置のバイトを覗き見る（消費しない）。EOF なら `None`。
    pub fn peek(&self) -> Option<u8> {
        self.input.get(self.pos).copied()
    }

    /// 現在位置から `offset` バイト先のバイトを覗き見る（消費しない）。
    ///
    /// `pos + offset` が `usize` をオーバーフローする場合、または範囲外の場合は `None`。
    pub fn peek_at(&self, offset: usize) -> Option<u8> {
        self.pos
            .checked_add(offset)
            .and_then(|p| self.input.get(p).copied())
    }

    /// 現在位置のバイトを返して 1 バイト前進する。EOF なら `None`（`pos` は不変）。
    ///
    /// `pos` の前進は `checked_add` 経由で扱う（panic 不在契約。`pos = usize::MAX` で
    /// あれば `peek()` が `None` を返す経路に入るため理論上到達しないが、契約を
    /// 機械的に守るために `?` で明示する）。
    pub fn advance(&mut self) -> Option<u8> {
        let byte = self.peek()?;
        self.pos = self.pos.checked_add(1)?;
        Some(byte)
    }

    /// `pos` が入力末尾に達しているか（EOF）。
    ///
    /// 不変条件 `0 ≦ pos ≦ input.len()` の下では `pos == input.len()` と等価だが、
    /// 不変条件の破れを検知不能にしないため実装は `>=` で防衛的に判定する。
    pub fn is_eof(&self) -> bool {
        self.pos >= self.input.len()
    }

    /// ISO 32000 のホワイトスペース 6 バイト（NUL/TAB/LF/FF/CR/SP）を連続して読み飛ばす。
    ///
    /// 非ホワイトスペースバイトまたは EOF に到達したら停止する。本関数は CR と LF を
    /// 独立した whitespace バイトとして 1 バイトずつ消費するだけで、改行（EOL）という
    /// 概念は扱わない。改行を 1 単位として扱う必要がある場合（CRLF を 2 改行と数えない
    /// 等）は本関数ではなく `EolKind::at` / `byte_len` を用いること（`skip_comment` 側で
    /// この方針を担保している）。
    pub fn skip_whitespace(&mut self) {
        while let Some(byte) = self.input.get(self.pos) {
            if !ByteKind::is_whitespace(*byte) {
                break;
            }
            match self.pos.checked_add(1) {
                Some(next) => self.pos = next,
                None => break,
            }
        }
    }

    /// 現在位置が `%` ならコメントを読み飛ばし、本文バイト列（`%` 直後〜EOL 直前）を返す。
    ///
    /// - 現在位置が `%` でない場合: `None` を返し `pos` は不変。
    /// - LF / CR / CRLF のいずれかで終端: 終端 EOL もまとめてスキップし、`pos` を進める
    ///   （CRLF は 2 バイトとしてまとめて扱う。2 改行に分解しない）。
    /// - EOF まで EOL なしで到達: 末尾までを本文として返し、`pos = input.len()` で停止。
    ///
    /// 戻り値の本文を捨てれば「黙ってスキップ」、保持すれば後段 `Token::Comment` 構築の
    /// 素材として再利用できる二用途設計。本文スライスは `&'a [u8]` を返すため、
    /// 呼び出し後に `&mut self` 借用が解除されても本文を保持でき、後続 `peek` 等と併用可能。
    pub fn skip_comment(&mut self) -> Option<&'a [u8]> {
        if self.peek() != Some(b'%') {
            return None;
        }
        self.pos = self.pos.checked_add(1)?;
        let body_start = self.pos;
        loop {
            if let Some(eol) = EolKind::at(self.input, self.pos) {
                let body_end = self.pos;
                match self.pos.checked_add(eol.byte_len()) {
                    Some(next) => self.pos = next,
                    None => self.pos = self.input.len(),
                }
                return self.input.get(body_start..body_end);
            }
            if self.input.get(self.pos).is_none() {
                return self.input.get(body_start..self.pos);
            }
            match self.pos.checked_add(1) {
                Some(next) => self.pos = next,
                None => return self.input.get(body_start..self.pos),
            }
        }
    }

    /// ホワイトスペースとコメントを交互に・連続してすべて読み飛ばす。
    ///
    /// `peek()` がホワイトスペースでも `%` でもないバイトを指すか、EOF に達したら停止。
    /// コメント本文は破棄する。
    pub fn skip_whitespace_and_comments(&mut self) {
        loop {
            self.skip_whitespace();
            if self.peek() == Some(b'%') {
                let _ = self.skip_comment();
                continue;
            }
            break;
        }
    }

    /// 現在位置から PDF 整数トークン（ISO 32000-1 §7.3.3）を読み出す。
    ///
    /// 先頭の `+` / `-` 符号（任意）と ASCII 数字 1 文字以上から成る字句を整数として
    /// 解釈し、`i64` で返す。読み終了の条件は「whitespace / delimiter / EOF に到達」
    /// する地点。`.` または非数字 regular byte（例: `123abc`）に到達した場合は整数として
    /// 完結できないため `None` を返し、`pos` を呼び出し前の位置に巻き戻す。整数として
    /// 完結できる場合は `Some(i64)` を返し `pos` を末尾まで進める。
    ///
    /// 以下の場合は `None` を返し、`pos` は呼び出し前の位置に戻す（巻き戻し）:
    /// - 先頭バイトが `+` / `-` / ASCII 数字 のいずれでもない（pos は元々動かないため
    ///   実質的に不変）
    /// - 先頭 `+` / `-` のみで直後に ASCII 数字 が続かない（例: `+x`, `-`, `-(`）
    /// - 数字読み中に `.` を検出（実数候補。上位で `read_real` を試せるよう pos を戻す）
    /// - 数字読み中に数字でも `.` でもない regular byte を検出（PDF トークン境界違反。
    ///   例: `123abc`）
    /// - `i64` のオーバーフロー（`checked_mul` / `checked_add` / `checked_sub` が None）
    ///
    /// `i64::MIN` の絶対値は `i64::MAX + 1` で正数として表現不可のため、累積は
    /// **符号付き**で行う（正なら `checked_add`、負なら `checked_sub`）。これにより
    /// `-9223372036854775808` を `Some(i64::MIN)` として正しく扱える。
    pub fn read_integer(&mut self) -> Option<i64> {
        let start = self.pos;

        let sign: i64 = match self.peek() {
            Some(b'+') => {
                self.pos = self.pos.checked_add(1)?;
                1
            }
            Some(b'-') => {
                self.pos = self.pos.checked_add(1)?;
                -1
            }
            Some(b) if b.is_ascii_digit() => 1,
            _ => return None,
        };

        match self.peek() {
            Some(b) if b.is_ascii_digit() => {}
            _ => {
                self.pos = start;
                return None;
            }
        }

        let mut acc: i64 = 0;
        // 停止条件が EOF だけでなく「境界 break / 巻き戻し return / オーバーフロー return」と
        // 多岐にわたるため、while let ではなく loop + let-else で表現する。
        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else { break };

            if ByteKind::is_whitespace(b) || ByteKind::is_delimiter(b) {
                break;
            }
            if !b.is_ascii_digit() {
                self.pos = start;
                return None;
            }

            let d = (b - b'0') as i64;
            let next_acc = acc.checked_mul(10).and_then(|v| match sign {
                1 => v.checked_add(d),
                _ => v.checked_sub(d),
            });
            let Some(v) = next_acc else {
                self.pos = start;
                return None;
            };
            acc = v;

            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }

        Some(acc)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ---------- Phase 1: 構築と position ----------

    #[test]
    fn new_with_empty_input_sets_pos_zero() {
        // 空入力で Lexer を構築すると position が 0 になることを確認する
        let lexer = Lexer::new(&[]);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn new_with_non_empty_input_sets_pos_zero() {
        // 非空入力で Lexer を構築しても初期 position は 0 であることを確認する
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn position_returns_current_pos_after_advance() {
        // advance を 2 回呼んだ後の position が 2 になることを確認する（三角測量）
        let mut lexer = Lexer::new(b"abc");
        lexer.advance();
        lexer.advance();
        assert_eq!(lexer.position(), 2);
    }

    // ---------- Phase 2: peek / peek_at ----------

    #[test]
    fn peek_returns_first_byte_at_pos_zero() {
        // pos=0 で peek が先頭バイト 'a' を返すことを確認する
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.peek(), Some(b'a'));
    }

    #[test]
    fn peek_does_not_consume_byte() {
        // peek を 2 回連続呼んでも消費されず position が 0 のままであることを確認する
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.peek(), Some(b'a'));
        assert_eq!(lexer.peek(), Some(b'a'));
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn peek_returns_none_for_empty_input() {
        // 空入力に対する peek が None を返すことを確認する
        let lexer = Lexer::new(&[]);
        assert_eq!(lexer.peek(), None);
    }

    #[test]
    fn peek_returns_none_at_eof() {
        // EOF まで進めた後の peek が None を返すことを確認する
        let mut lexer = Lexer::new(b"ab");
        lexer.advance();
        lexer.advance();
        assert_eq!(lexer.peek(), None);
    }

    #[test]
    fn peek_at_returns_byte_at_offset() {
        // peek_at(2) が pos+2 のバイト 'c' を返すことを確認する
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.peek_at(2), Some(b'c'));
    }

    #[test]
    fn peek_at_with_offset_zero_returns_same_as_peek() {
        // offset=0 の peek_at が peek と同じ先頭バイトを返すことを確認する
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.peek_at(0), Some(b'a'));
        assert_eq!(lexer.peek_at(0), lexer.peek());
    }

    #[test]
    fn peek_at_with_offset_equal_to_len_returns_none() {
        // checked_add は成功するが slice::get が None を返す境界（pos+offset == input.len()）で None
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.peek_at(3), None);
    }

    #[test]
    fn peek_at_with_usize_max_returns_none() {
        // peek_at(usize::MAX) が checked_add のオーバーフローで None を返し panic しないことを確認する
        let lexer = Lexer::new(b"abc");
        assert_eq!(lexer.peek_at(usize::MAX), None);
    }

    // ---------- Phase 3: advance / is_eof ----------

    #[test]
    fn advance_consumes_one_byte_and_returns_some() {
        // advance が先頭バイトを返して position を 1 進めることを確認する
        let mut lexer = Lexer::new(b"abc");
        assert_eq!(lexer.advance(), Some(b'a'));
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn advance_returns_each_byte_in_order() {
        // advance を 3 回連続で呼び 'a','b','c' の順に返ることを確認する（三角測量）
        let mut lexer = Lexer::new(b"abc");
        assert_eq!(lexer.advance(), Some(b'a'));
        assert_eq!(lexer.advance(), Some(b'b'));
        assert_eq!(lexer.advance(), Some(b'c'));
    }

    #[test]
    fn advance_returns_none_at_eof_without_moving_pos() {
        // EOF 時の advance が None を返し position が不変であることを確認する
        let mut lexer = Lexer::new(b"a");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.advance(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn advance_returns_none_for_empty_input() {
        // 空入力の advance が None を返し position が 0 のままであることを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.advance(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn is_eof_returns_false_initially_and_true_after_consuming_all() {
        // 初期状態は EOF でなく、全バイト消費後に EOF となることを確認する
        let mut lexer = Lexer::new(b"ab");
        assert!(!lexer.is_eof());
        lexer.advance();
        lexer.advance();
        assert!(lexer.is_eof());
    }

    #[test]
    fn is_eof_returns_true_for_empty_input_initially() {
        // 空入力の初期状態（pos=0, len=0）で is_eof が即 true となる境界を確認する
        let lexer = Lexer::new(&[]);
        assert!(lexer.is_eof());
    }

    // ---------- Phase 4: skip_whitespace ----------

    #[test]
    fn skip_whitespace_consumes_all_six_whitespace_bytes() {
        // ISO 32000 の whitespace 6 バイト（NUL/TAB/LF/FF/CR/SP）を全消費することを確認する
        let mut lexer = Lexer::new(b"\x00\t\n\x0c\r ");
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn skip_whitespace_stops_at_regular_byte() {
        // 通常バイトに到達したら停止し peek がそのバイトを指すことを確認する
        let mut lexer = Lexer::new(b"  abc");
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), 2);
        assert_eq!(lexer.peek(), Some(b'a'));
    }

    #[test]
    fn skip_whitespace_stops_at_delimiter_byte() {
        // delimiter '(' に到達したら停止し peek がそのバイトを指すことを確認する
        let mut lexer = Lexer::new(b"  (");
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), 2);
        assert_eq!(lexer.peek(), Some(b'('));
    }

    #[test]
    fn skip_whitespace_handles_consecutive_newlines() {
        // 連続する LF を 3 つすべてスキップすることを確認する
        let mut lexer = Lexer::new(b"\n\n\n");
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn skip_whitespace_handles_mixed_cr_lf_crlf() {
        // 混在する CR/LF/CRLF を独立 whitespace として 1 バイトずつ全消費することを確認する
        let mut lexer = Lexer::new(b"\r\n\r\n\r");
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn skip_whitespace_is_noop_for_empty_input() {
        // 空入力で skip_whitespace が panic せず position が 0 のままであることを確認する
        let mut lexer = Lexer::new(&[]);
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn skip_whitespace_is_noop_at_eof() {
        // EOF 状態で skip_whitespace が panic せず position 不変であることを確認する
        let mut lexer = Lexer::new(b"ab");
        lexer.advance();
        lexer.advance();
        let pos_before = lexer.position();
        lexer.skip_whitespace();
        assert_eq!(lexer.position(), pos_before);
    }

    // ---------- Phase 5: skip_comment ----------

    #[test]
    fn skip_comment_returns_none_when_pos_not_at_percent() {
        // 先頭が '%' でないとき skip_comment が None を返し pos が不変であることを確認する
        let mut lexer = Lexer::new(b"abc");
        assert_eq!(lexer.skip_comment(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn skip_comment_consumes_until_lf_and_returns_body_without_percent() {
        // LF 終端コメントで本文 'hello' を返し終端 LF までスキップすることを確認する
        let mut lexer = Lexer::new(b"%hello\nrest");
        assert_eq!(lexer.skip_comment(), Some(b"hello".as_slice()));
        assert_eq!(lexer.peek(), Some(b'r'));
    }

    #[test]
    fn skip_comment_consumes_until_cr_and_returns_body() {
        // CR 単独終端コメントで本文 'hi' を返し終端 CR までスキップすることを確認する
        let mut lexer = Lexer::new(b"%hi\rrest");
        assert_eq!(lexer.skip_comment(), Some(b"hi".as_slice()));
        assert_eq!(lexer.peek(), Some(b'r'));
    }

    #[test]
    fn skip_comment_consumes_until_crlf_and_returns_body() {
        // CRLF 終端コメントで本文 'c' を返し CRLF を 2 バイトでまとめてスキップすることを確認する
        let mut lexer = Lexer::new(b"%c\r\nrest");
        assert_eq!(lexer.skip_comment(), Some(b"c".as_slice()));
        assert_eq!(lexer.peek(), Some(b'r'));
    }

    #[test]
    fn skip_comment_handles_empty_comment_terminated_by_lf() {
        // LF 終端の空コメント '%\n' で本文が空スライスになることを確認する
        let mut lexer = Lexer::new(b"%\nrest");
        assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
        assert_eq!(lexer.peek(), Some(b'r'));
    }

    #[test]
    fn skip_comment_handles_empty_comment_terminated_by_cr() {
        // CR 単独終端の空コメント '%\r' で本文が空スライスになることを確認する
        let mut lexer = Lexer::new(b"%\rrest");
        assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
        assert_eq!(lexer.peek(), Some(b'r'));
    }

    #[test]
    fn skip_comment_handles_empty_comment_terminated_by_crlf() {
        // CRLF 終端の空コメント '%\r\n' で本文が空スライスになることを確認する
        let mut lexer = Lexer::new(b"%\r\nrest");
        assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
        assert_eq!(lexer.peek(), Some(b'r'));
    }

    #[test]
    fn skip_comment_handles_lone_percent_at_eof() {
        // EOF 直前の単独 '%' で本文が空スライスになり EOF に達することを確認する
        let mut lexer = Lexer::new(b"%");
        assert_eq!(lexer.skip_comment(), Some(b"".as_slice()));
        assert!(lexer.is_eof());
    }

    #[test]
    fn skip_comment_handles_eof_without_eol() {
        // EOL なしで EOF に到達するコメントが末尾までを本文として返すことを確認する
        let mut lexer = Lexer::new(b"%comment_without_newline");
        assert_eq!(
            lexer.skip_comment(),
            Some(b"comment_without_newline".as_slice())
        );
        assert!(lexer.is_eof());
    }

    #[test]
    fn skip_comment_handles_pdf_header_style() {
        // PDF ヘッダ風 '%PDF-1.7\n' の本文を返し終端 LF までスキップすることを確認する
        let mut lexer = Lexer::new(b"%PDF-1.7\n");
        assert_eq!(lexer.skip_comment(), Some(b"PDF-1.7".as_slice()));
        assert_eq!(lexer.peek(), None);
    }

    #[test]
    fn skip_comment_handles_eof_marker_style() {
        // '%%EOF' で 2 つ目の '%' を本文の一部として扱い末尾までスキップすることを確認する
        let mut lexer = Lexer::new(b"%%EOF");
        assert_eq!(lexer.skip_comment(), Some(b"%EOF".as_slice()));
        assert!(lexer.is_eof());
    }

    #[test]
    fn skip_comment_returns_none_for_empty_input() {
        // 空入力に対する skip_comment が None を返し pos が 0 のままであることを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.skip_comment(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn skip_comment_at_mid_buffer_advances_correctly() {
        // 中間位置 'x%c\nz' で advance 後の skip_comment が本文 'c' を返し peek が 'z' になることを確認する
        let mut lexer = Lexer::new(b"x%c\nz");
        lexer.advance();
        assert_eq!(lexer.skip_comment(), Some(b"c".as_slice()));
        assert_eq!(lexer.peek(), Some(b'z'));
    }

    #[test]
    fn skip_comment_body_outlives_subsequent_peek_call() {
        // 戻り値本文の lifetime が 'a であり後続 peek 呼び出し後も保持できることを確認する
        let mut lexer = Lexer::new(b"%hello\nrest");
        let body = lexer.skip_comment();
        assert_eq!(lexer.peek(), Some(b'r'));
        assert_eq!(body, Some(b"hello".as_slice()));
    }

    // ---------- Phase 6: skip_whitespace_and_comments ----------

    #[test]
    fn skip_ws_and_comments_stops_at_regular_byte() {
        // 空白のみの入力で peek が通常バイト 'a' を指して停止することを確認する
        let mut lexer = Lexer::new(b"  abc");
        lexer.skip_whitespace_and_comments();
        assert_eq!(lexer.peek(), Some(b'a'));
    }

    #[test]
    fn skip_ws_and_comments_handles_alternating_sequence() {
        // 空白とコメントが交互に続く入力で最終的に peek が 'X' を指すことを確認する
        let mut lexer = Lexer::new(b" %a\n %b\n X");
        lexer.skip_whitespace_and_comments();
        assert_eq!(lexer.peek(), Some(b'X'));
    }

    #[test]
    fn skip_ws_and_comments_handles_consecutive_comments() {
        // 連続する 3 つのコメントを順次スキップして peek が 'Z' を指すことを確認する
        let mut lexer = Lexer::new(b"%a\n%b\n%c\nZ");
        lexer.skip_whitespace_and_comments();
        assert_eq!(lexer.peek(), Some(b'Z'));
    }

    #[test]
    fn skip_ws_and_comments_handles_crlf_separated_consecutive_comments() {
        // CRLF 区切りの連続コメントでも合成 API が peek 'Z' に到達することを確認する
        let mut lexer = Lexer::new(b"%a\r\n%b\r\n%c\r\nZ");
        lexer.skip_whitespace_and_comments();
        assert_eq!(lexer.peek(), Some(b'Z'));
    }

    #[test]
    fn skip_ws_and_comments_handles_eol_less_eof_comment() {
        // EOL なしの末尾コメントを panic せずに最後まで読み EOF に達することを確認する
        let mut lexer = Lexer::new(b" %trailing_without_eol");
        lexer.skip_whitespace_and_comments();
        assert!(lexer.is_eof());
    }

    #[test]
    fn skip_ws_and_comments_is_noop_for_empty_input() {
        // 空入力で合成 API が panic せず EOF を返すことを確認する
        let mut lexer = Lexer::new(&[]);
        lexer.skip_whitespace_and_comments();
        assert!(lexer.is_eof());
    }

    #[test]
    fn skip_ws_and_comments_stops_at_delimiter_not_percent() {
        // '%' 以外の delimiter '(' で停止し peek がそのバイトを指すことを確認する
        let mut lexer = Lexer::new(b"   (");
        lexer.skip_whitespace_and_comments();
        assert_eq!(lexer.peek(), Some(b'('));
    }

    // ---------- Phase 7: 横断（panic 不在 / 不変条件 / 結合） ----------

    #[test]
    fn all_apis_do_not_panic_at_eof() {
        // EOF 状態で全 API を順に呼んでも panic せず pos が input.len() を維持することを確認する
        let mut lexer = Lexer::new(b"ab");
        lexer.advance();
        lexer.advance();
        let len = 2;
        let _ = lexer.peek();
        let _ = lexer.peek_at(0);
        let _ = lexer.peek_at(usize::MAX);
        let _ = lexer.advance();
        lexer.skip_whitespace();
        let _ = lexer.skip_comment();
        lexer.skip_whitespace_and_comments();
        let _ = lexer.read_integer();
        assert_eq!(lexer.position(), len);
        assert!(lexer.is_eof());
    }

    #[test]
    fn all_apis_do_not_panic_for_empty_input() {
        // 空入力で全 API を順に呼んでも panic せず pos が 0 を維持することを確認する
        let mut lexer = Lexer::new(&[]);
        let _ = lexer.peek();
        let _ = lexer.peek_at(0);
        let _ = lexer.peek_at(usize::MAX);
        let _ = lexer.advance();
        lexer.skip_whitespace();
        let _ = lexer.skip_comment();
        lexer.skip_whitespace_and_comments();
        let _ = lexer.read_integer();
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn position_never_exceeds_input_len_after_skip() {
        // 各種入力で skip 系を呼んだ後 position が input.len() を超えないことを確認する
        let inputs: &[&[u8]] = &[b"", b" ", b"%c\n", b" %a\n %b\n"];
        for input in inputs {
            let mut lexer = Lexer::new(input);
            lexer.skip_whitespace();
            assert!(lexer.position() <= input.len());
            let _ = lexer.skip_comment();
            assert!(lexer.position() <= input.len());
            lexer.skip_whitespace_and_comments();
            assert!(lexer.position() <= input.len());
        }
    }

    #[test]
    fn skip_comment_after_skip_whitespace_processes_pdf_header_then_body() {
        // PDF ヘッダ風の結合入力で合成 API 1 回呼び出し後に peek が本文先頭 'b' を指すことを確認する
        let mut lexer = Lexer::new(b"\n%PDF-1.7\nbody");
        lexer.skip_whitespace_and_comments();
        assert_eq!(lexer.peek(), Some(b'b'));
    }

    // ---------- Phase 8: read_integer ----------

    // Phase 8-A: 早期 None（先頭バイトが該当せず pos 不変）

    #[test]
    fn read_integer_returns_none_for_empty_input() {
        // 空入力に対する read_integer が None を返し pos が 0 のままであることを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_at_eof() {
        // EOF 状態の read_integer が None を返し pos が EOF 位置のままであることを確認する
        let mut lexer = Lexer::new(b"a");
        lexer.advance();
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_integer_returns_none_for_leading_whitespace() {
        // 先頭が whitespace の入力で read_integer が None・pos が 0 のままであることを確認する
        let mut lexer = Lexer::new(b" 123");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_leading_delimiter() {
        // 先頭が delimiter '(' の入力で read_integer が None・pos が 0 のままであることを確認する
        let mut lexer = Lexer::new(b"(123");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_every_leading_delimiter_byte() {
        // 仕様 §2.2 の delimiter 10 バイト全てを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for d in delimiter_bytes {
            let input = [d, b'1', b'2', b'3'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_integer(),
                None,
                "delimiter 0x{d:02X} should yield None"
            );
            assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
        }
    }

    #[test]
    fn read_integer_returns_none_for_every_leading_whitespace_byte() {
        // 仕様 §2.1 の whitespace 6 バイト全てを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for w in whitespace_bytes {
            let input = [w, b'1', b'2', b'3'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_integer(),
                None,
                "whitespace 0x{w:02X} should yield None"
            );
            assert_eq!(
                lexer.position(),
                0,
                "whitespace 0x{w:02X} should keep pos 0"
            );
        }
    }

    #[test]
    fn read_integer_returns_none_for_leading_non_digit_regular_byte() {
        // 先頭が非数字 regular の入力で read_integer が None・pos が 0 のままであることを確認する
        let mut lexer = Lexer::new(b"abc");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_lone_plus_at_eof() {
        // 符号 '+' のみで EOF の入力が None を返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"+");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_lone_minus_at_eof() {
        // 符号 '-' のみで EOF の入力が None を返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"-");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_plus_then_non_digit_regular() {
        // '+' の直後が非数字 regular のとき None を返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"+x");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_minus_then_delimiter() {
        // '-' の直後が delimiter のとき None を返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"-(");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_plus_then_whitespace() {
        // '+' の直後が whitespace のとき None を返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"+ ");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_sign_then_every_delimiter_byte() {
        // 符号 ∈ {+, -} × delimiter 10 種の全 20 組で None・pos 0 に巻き戻されることを確認する
        let signs = [b'+', b'-'];
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for s in signs {
            for d in delimiter_bytes {
                let input = [s, d];
                let mut lexer = Lexer::new(&input);
                assert_eq!(
                    lexer.read_integer(),
                    None,
                    "sign 0x{s:02X} + delimiter 0x{d:02X} should yield None"
                );
                assert_eq!(
                    lexer.position(),
                    0,
                    "sign 0x{s:02X} + delimiter 0x{d:02X} should rollback to 0"
                );
            }
        }
    }

    #[test]
    fn read_integer_returns_none_for_sign_then_every_whitespace_byte() {
        // 符号 ∈ {+, -} × whitespace 6 種の全 12 組で None・pos 0 に巻き戻されることを確認する
        let signs = [b'+', b'-'];
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for s in signs {
            for w in whitespace_bytes {
                let input = [s, w];
                let mut lexer = Lexer::new(&input);
                assert_eq!(
                    lexer.read_integer(),
                    None,
                    "sign 0x{s:02X} + whitespace 0x{w:02X} should yield None"
                );
                assert_eq!(
                    lexer.position(),
                    0,
                    "sign 0x{s:02X} + whitespace 0x{w:02X} should rollback to 0"
                );
            }
        }
    }

    // Phase 8-B: 単一/複数桁の正数（符号なし）

    #[test]
    fn read_integer_reads_single_digit_zero() {
        // 単一桁 '0' を Some(0) として読み pos を 1 進めることを確認する
        let mut lexer = Lexer::new(b"0");
        assert_eq!(lexer.read_integer(), Some(0));
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_integer_reads_single_digit_seven() {
        // 値の三角測量: 単一桁 '7' を Some(7) として読むことを確認する
        let mut lexer = Lexer::new(b"7");
        assert_eq!(lexer.read_integer(), Some(7));
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_integer_reads_multi_digit_123() {
        // 桁数の三角測量: 複数桁 '123' を Some(123) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"123");
        assert_eq!(lexer.read_integer(), Some(123));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_integer_reads_leading_zero_padded_00042() {
        // 先頭ゼロ '00042' を Some(42) として読み pos を 5 進めることを確認する（先頭ゼロ許容）
        let mut lexer = Lexer::new(b"00042");
        assert_eq!(lexer.read_integer(), Some(42));
        assert_eq!(lexer.position(), 5);
    }

    // Phase 8-C: + 付き正数

    #[test]
    fn read_integer_reads_plus_zero() {
        // '+0' を Some(0) として読み pos を 2 進めることを確認する
        let mut lexer = Lexer::new(b"+0");
        assert_eq!(lexer.read_integer(), Some(0));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_integer_reads_plus_17() {
        // 値の三角測量: '+17' を Some(17) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"+17");
        assert_eq!(lexer.read_integer(), Some(17));
        assert_eq!(lexer.position(), 3);
    }

    // Phase 8-D: - 付き負数

    #[test]
    fn read_integer_reads_minus_one() {
        // '-1' を Some(-1) として読み pos を 2 進めることを確認する
        let mut lexer = Lexer::new(b"-1");
        assert_eq!(lexer.read_integer(), Some(-1));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_integer_reads_minus_45() {
        // 値の三角測量: '-45' を Some(-45) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"-45");
        assert_eq!(lexer.read_integer(), Some(-45));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_integer_reads_minus_leading_zero_007() {
        // 負数の先頭ゼロ '-007' を Some(-7) として読み pos を 4 進めることを確認する
        let mut lexer = Lexer::new(b"-007");
        assert_eq!(lexer.read_integer(), Some(-7));
        assert_eq!(lexer.position(), 4);
    }

    // Phase 8-E: トークン境界

    #[test]
    fn read_integer_stops_at_whitespace() {
        // 後続が空白の '42 rest' を Some(42) として読み peek が ' ' を指すことを確認する
        let mut lexer = Lexer::new(b"42 rest");
        assert_eq!(lexer.read_integer(), Some(42));
        assert_eq!(lexer.position(), 2);
        assert_eq!(lexer.peek(), Some(b' '));
    }

    #[test]
    fn read_integer_stops_at_delimiter() {
        // 後続が delimiter の '42]rest' を Some(42) として読み peek が ']' を指すことを確認する
        let mut lexer = Lexer::new(b"42]rest");
        assert_eq!(lexer.read_integer(), Some(42));
        assert_eq!(lexer.position(), 2);
        assert_eq!(lexer.peek(), Some(b']'));
    }

    #[test]
    fn read_integer_stops_at_every_delimiter_byte() {
        // '42' + delimiter 10 種の全組で Some(42)・pos 2・peek が当該 delimiter を指すことを確認する
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for d in delimiter_bytes {
            let input = [b'4', b'2', d];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_integer(),
                Some(42),
                "delimiter 0x{d:02X} should still yield Some(42)"
            );
            assert_eq!(lexer.position(), 2, "delimiter 0x{d:02X} should stop at 2");
            assert_eq!(
                lexer.peek(),
                Some(d),
                "delimiter 0x{d:02X} should be the next peek byte"
            );
        }
    }

    #[test]
    fn read_integer_stops_at_every_whitespace_byte() {
        // '42' + whitespace 6 種の全組で Some(42)・pos 2・peek が当該 whitespace を指すことを確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for w in whitespace_bytes {
            let input = [b'4', b'2', w];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_integer(),
                Some(42),
                "whitespace 0x{w:02X} should still yield Some(42)"
            );
            assert_eq!(lexer.position(), 2, "whitespace 0x{w:02X} should stop at 2");
            assert_eq!(
                lexer.peek(),
                Some(w),
                "whitespace 0x{w:02X} should be the next peek byte"
            );
        }
    }

    #[test]
    fn read_integer_stops_at_eof() {
        // EOF 直前の '42' を Some(42) として読み EOF に達することを確認する
        let mut lexer = Lexer::new(b"42");
        assert_eq!(lexer.read_integer(), Some(42));
        assert_eq!(lexer.position(), 2);
        assert!(lexer.is_eof());
    }

    #[test]
    fn read_integer_stops_at_lf() {
        // 後続が LF の '42\n' を Some(42) として読み peek が LF を指すことを確認する
        let mut lexer = Lexer::new(b"42\n");
        assert_eq!(lexer.read_integer(), Some(42));
        assert_eq!(lexer.position(), 2);
        assert_eq!(lexer.peek(), Some(b'\n'));
    }

    #[test]
    fn read_integer_returns_none_for_digits_then_non_digit_regular() {
        // 数字途中で非数字 regular '123abc' を検出した場合 None・pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"123abc");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_signed_digits_then_non_digit_regular() {
        // 符号付き数字途中で非数字 regular '-12x' を検出した場合 None・pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"-12x");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 8-F: . 遭遇（実数候補 — 次タスクの read_real に渡すため巻き戻し）

    #[test]
    fn read_integer_returns_none_when_dot_after_digits() {
        // 数字後に '.' が続く '12.3' を None として返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"12.3");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_when_dot_at_trailing() {
        // 末尾が '.' の '4.' を None として返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"4.");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_when_leading_dot() {
        // 先頭が '.' の '.002' を None として返し pos が 0 のままであることを確認する（先頭バイト早期 None 経路）
        let mut lexer = Lexer::new(b".002");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_when_dot_after_sign_and_digits() {
        // 符号付き数字後に '.' が続く '-3.14' を None として返し pos が 0 に巻き戻されることを確認する
        let mut lexer = Lexer::new(b"-3.14");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 8-G: i64 境界（オーバーフロー検知）

    #[test]
    fn read_integer_reads_i64_max() {
        // i64::MAX (9223372036854775807) を Some(i64::MAX) として読み pos を 19 進めることを確認する
        let mut lexer = Lexer::new(b"9223372036854775807");
        assert_eq!(lexer.read_integer(), Some(i64::MAX));
        assert_eq!(lexer.position(), 19);
    }

    #[test]
    fn read_integer_returns_none_for_i64_max_plus_one() {
        // i64::MAX + 1 (9223372036854775808) は checked_add でオーバーフローし None・pos 巻き戻しになることを確認する
        let mut lexer = Lexer::new(b"9223372036854775808");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_reads_i64_min() {
        // 符号付き累積により i64::MIN (-9223372036854775808) を Some(i64::MIN) として読めることを確認する
        let mut lexer = Lexer::new(b"-9223372036854775808");
        assert_eq!(lexer.read_integer(), Some(i64::MIN));
        assert_eq!(lexer.position(), 20);
    }

    #[test]
    fn read_integer_returns_none_for_i64_min_minus_one() {
        // i64::MIN - 1 (-9223372036854775809) は checked_sub でオーバーフローし None・pos 巻き戻しになることを確認する
        let mut lexer = Lexer::new(b"-9223372036854775809");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_integer_returns_none_for_very_long_digits_overflow() {
        // i64 桁数を大幅に超える数字列は途中で checked_mul が None を返し巻き戻されることを確認する
        let mut lexer = Lexer::new(b"99999999999999999999999");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 8-H: pos 巻き戻し（中間位置 / 副作用検証）

    #[test]
    fn read_integer_at_mid_buffer_advances_correctly() {
        // 'x123 ' で先頭 'x' を advance 後 read_integer を呼び Some(123)・pos == 4・peek が ' ' を指すことを確認する
        let mut lexer = Lexer::new(b"x123 ");
        lexer.advance();
        assert_eq!(lexer.read_integer(), Some(123));
        assert_eq!(lexer.position(), 4);
        assert_eq!(lexer.peek(), Some(b' '));
    }

    #[test]
    fn read_integer_failure_at_mid_buffer_rolls_back_to_call_site() {
        // 'x12.3' で先頭 'x' を advance 後（pos == 1）に read_integer を呼ぶと None かつ pos が 1（呼び出し前位置）に巻き戻ることを確認する
        let mut lexer = Lexer::new(b"x12.3");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 1);
    }
}
