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
//! ホワイトスペース・コメントのスキップ API、低レベル read API（整数 / 実数 /
//! 名前 / 配列・辞書デリミタ / キーワード等）と、それらをまとめて 1 トークン分の
//! ディスパッチを行う `next_token` API を提供する。
//! 本層は PDF レキシカル層の最下層 API であり、任意の入力・任意の pos に
//! 対して panic しない契約を厳守する（既存 `EolKind::at` と同方針）。

pub mod byte_kind;
mod byte_ops;
pub mod eol;
mod hex_string;
mod literal_string;
pub mod token;
mod token_buffer;

use std::collections::VecDeque;

use crate::object::name::PdfName;
use byte_kind::ByteKind;
use eol::EolKind;
use token::{Primitive, Token};

// 内部ヘルパ: 16進数字 1 バイト ('0'-'9' / 'a'-'f' / 'A'-'F') を 0-15 に変換する。
// 呼び出し側で is_ascii_hexdigit を確認済みであることを前提とする。
fn hex_value(b: u8) -> u8 {
    match b {
        b'0'..=b'9' => b - b'0',
        b'a'..=b'f' => b - b'a' + 10,
        _ => b - b'A' + 10,
    }
}

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
    buffer: VecDeque<(Token, usize)>,
}

impl<'a> Lexer<'a> {
    /// 入力バイト列を借用して新しい `Lexer` を生成する。`pos` は 0 で初期化される。
    pub fn new(input: &'a [u8]) -> Self {
        Self {
            input,
            pos: 0,
            buffer: VecDeque::new(),
        }
    }

    /// 論理カーソル位置を返す。バッファに peek 済みトークンがあればその先頭エントリの開始位置を、
    /// バッファ空時は現在のカーソル位置 (`self.pos`) を返す。
    ///
    /// 「次に `take_token` で取り出されるトークンの開始バイト位置」と等価。
    /// バッファを無視した生のカーソル位置が必要な場合は [`Self::cursor_position`] を使う。
    pub fn position(&self) -> usize {
        self.buffer.front().map(|(_, pos)| *pos).unwrap_or(self.pos)
    }

    /// バイト単位のカーソル位置 (`self.pos`) を直接返す。バッファ内のトークンを無視した生の値。
    ///
    /// 用途: lookahead 中に lexer が malformed を検知した場合のエラー位置報告など、
    /// 論理カーソルではなく生バイト位置が必要な場面で使う。
    /// 通常の論理カーソルが必要な場合は [`Self::position`] を使う。
    pub fn cursor_position(&self) -> usize {
        self.pos
    }

    #[cfg(test)]
    pub(crate) fn buffer_capacity_for_tests(&self) -> usize {
        self.buffer.capacity()
    }

    /// 次に消費されるトークンを参照で覗き見る（Comment 透過込み）。
    ///
    /// peek した値は次回 `take_token`（および続く `peek_token`）でも同じ値を返す。
    /// `peek_token_at(0) == peek_token()`（0-indexed の最先頭）。
    pub fn peek_token(&mut self) -> Option<&Token> {
        self.peek_token_at(0)
    }

    /// 0-indexed で `n` 番目に取り出されるトークンを参照で覗き見る（Comment 透過込み）。
    ///
    /// `peek_token_at(0) == peek_token()`（0-indexed の最先頭）。
    /// peek した値は次回 `take_token` / `peek_token` でも同じ値を返す。
    /// `n` が `usize::MAX` でも panic せず `None` を返す（`n.checked_add(1)` で吸収）。
    pub fn peek_token_at(&mut self, n: usize) -> Option<&Token> {
        let required = n.checked_add(1)?;
        token_buffer::ensure_buffered(self, required)?;
        self.buffer.get(n).map(|(tok, _)| tok)
    }

    /// 次のトークンをムーブで取り出す（Comment 透過込み）。
    ///
    /// 直前の `peek_token` / `peek_token_at(0)` で得た値（0-indexed の最先頭）と
    /// 同じトークンを返す。peek した値は次回 `take_token`（および続く `peek_token`）でも
    /// 同じ値を返す不変条件を保つ。
    /// バッファ非空ならフロントから、空時は内部で直接 lex を進める（`push_back` を経由しない）。
    pub fn take_token(&mut self) -> Option<Token> {
        if let Some((tok, _)) = self.buffer.pop_front() {
            return Some(tok);
        }
        token_buffer::next_non_comment_token(self).map(|(tok, _)| tok)
    }

    /// 次に消費されるトークンを位置情報付きで覗き見る（Comment 透過込み）。
    ///
    /// `peek_token_at(0) == peek_token()` と同じトークンを位置情報 (token 開始バイト位置)
    /// と共に返す。peek した値は次回 `take_token_with_pos`（および `peek_token`）でも
    /// 同じ値を返し、`pos` も `take_token_with_pos` が返す値と一致する。
    pub fn peek_token_with_pos(&mut self) -> Option<(&Token, usize)> {
        token_buffer::ensure_buffered(self, 1)?;
        self.buffer.front().map(|(tok, pos)| (tok, *pos))
    }

    /// 次のトークンを位置情報付きでムーブ取り出す（Comment 透過込み）。
    ///
    /// 直前の `peek_token` 系 / `peek_token_with_pos`（`peek_token_at(0) == peek_token()`
    /// と等価な 0-indexed 最先頭）で得た値があれば、それと同じトークンと `pos` を返す。
    /// peek した値は次回 `take_token_with_pos` でも同じ値を返す不変条件を保つ。
    /// バッファ非空ならフロントから、空時は内部で直接 lex を進める（`push_back` を経由しない）。
    pub fn take_token_with_pos(&mut self) -> Option<(Token, usize)> {
        if let Some(entry) = self.buffer.pop_front() {
            return Some(entry);
        }
        token_buffer::next_non_comment_token(self)
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

    /// ISO 32000-1 §7.3.3 に従う PDF 実数リテラルを読み取る。
    ///
    /// 受理する字句（いずれも `.` を必ず 1 つだけ含む）:
    /// - 整数部 + `.` + 小数部（例: `34.5`、`123.456`）
    /// - 整数部 + `.` のみ（例: `4.`、`0.`）
    /// - `.` + 小数部のみ（例: `.002`、`.5`）
    /// - 上記いずれにも先頭の `+` / `-` 符号を任意で付与可
    /// - 末尾の whitespace / delimiter / EOF で字句が完結する
    ///
    /// 拒否する字句（`None` 返却 + `pos` を呼び出し前位置に完全巻き戻し）:
    /// - 空入力 / EOF
    /// - 先頭が whitespace / delimiter / 非数字 regular
    /// - 符号 `+` / `-` の単独（直後が数字でも `.` でもない）
    /// - 小数点 `.` の単独（整数部・小数部のいずれにも数字が無い）
    /// - `.` を含まない字句（整数のみ入力）— `.` 必須の実数のみ担当し、整数は `read_integer` の責務として拒否
    /// - 小数点の複数出現（`1.2.3`、`..`、`1..2`）
    /// - 指数表記 `e` / `E`（`1.2e3` / `1.2E3` / `1e2` / `.5e3` / `1.e3`）— ISO 32000-1 仕様外として厳格拒否
    /// - 数字読み中に whitespace / delimiter でも数字でも `.` でもない regular byte（`1.2abc` 等）
    /// - 累積で `f64::INFINITY` 等の非有限値に飽和した場合
    ///
    /// 戻り値の `Some(f64)` は常に有限値（NaN / Inf を返さない）。任意の入力・任意の `pos` で panic しない。
    pub fn read_real(&mut self) -> Option<f64> {
        let start = self.pos;

        let sign: f64 = match self.peek() {
            Some(b'+') => {
                self.pos = self.pos.checked_add(1)?;
                1.0
            }
            Some(b'-') => {
                self.pos = self.pos.checked_add(1)?;
                -1.0
            }
            Some(b) if b.is_ascii_digit() || b == b'.' => 1.0,
            _ => return None,
        };

        let int_start = self.pos;
        let mut int_part: f64 = 0.0;
        while let Some(b) = self.peek() {
            if !b.is_ascii_digit() {
                break;
            }
            int_part = int_part * 10.0 + (b - b'0') as f64;
            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }
        let int_end = self.pos;

        // '.' を含まない字句は実数リテラルではない（read_integer の責務）
        if self.peek() != Some(b'.') {
            self.pos = start;
            return None;
        }
        let Some(after_dot) = self.pos.checked_add(1) else {
            self.pos = start;
            return None;
        };
        self.pos = after_dot;

        let mut frac_part: f64 = 0.0;
        let mut scale: f64 = 0.1;
        while let Some(b) = self.peek() {
            if !b.is_ascii_digit() {
                break;
            }
            frac_part += (b - b'0') as f64 * scale;
            scale *= 0.1;
            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }

        // '.' を含むが整数部・小数部のいずれにも数字が無い場合は拒否（'.' 単独 / '+.' / '-.'）
        if int_end == int_start && self.pos == after_dot {
            self.pos = start;
            return None;
        }

        // 後続が whitespace / delimiter / EOF 以外なら拒否（'1.2abc' / '1.2.3' / '1.2e3' 等）
        match self.peek() {
            None => {}
            Some(b) if ByteKind::is_whitespace(b) || ByteKind::is_delimiter(b) => {}
            _ => {
                self.pos = start;
                return None;
            }
        }

        let value = sign * (int_part + frac_part);
        // f64 累積が Inf に飽和した場合は仕様準拠の値ではないため拒否
        if !value.is_finite() {
            self.pos = start;
            return None;
        }

        Some(value)
    }

    /// ISO 32000-1 §7.3.5 に従う PDF Name トークンを読み取る。
    ///
    /// 受理する字句:
    /// - 先頭バイト `/` の直後から、次の whitespace / delimiter / EOF までを Name 本体として読む
    /// - 本体中の `#XX`（`#` + 2桁 ASCII 16進数字、大小混在可）を 1 バイトに復号する
    /// - 復号後のバイト範囲 0x00〜0xFF（NUL 含む任意バイト）を受理する
    /// - 空名前 `/`（`/` 直後に whitespace / delimiter / EOF が続く）は `Some(PdfName::new(b""))` で受理
    /// - 名前長は無制限（仕様の推奨上限は実装上強制しない）
    ///
    /// 拒否する字句（`None` 返却 + `pos` を呼び出し前位置に完全巻き戻し）:
    /// - 空入力 / EOF
    /// - 先頭バイトが `/` でない（pos 不変で None）
    /// - `#` の直後 2 バイトのうち、どちらかが EOF / whitespace / delimiter / 非16進 regular byte
    ///
    /// 戻り値の `PdfName` は `/` 接頭辞を含まない、`#XX` デコード後の名前本体バイト列を保持する。
    /// 任意の入力・任意の `pos` で panic しない（`checked_add` / `slice::get` で範囲外を吸収）。
    pub fn read_name(&mut self) -> Option<PdfName> {
        let start = self.pos;

        if self.peek() != Some(b'/') {
            return None;
        }
        let Some(after_slash) = self.pos.checked_add(1) else {
            self.pos = start;
            return None;
        };
        self.pos = after_slash;

        let mut bytes: Vec<u8> = Vec::new();
        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else { break };

            if ByteKind::is_whitespace(b) || ByteKind::is_delimiter(b) {
                break;
            }

            if b != b'#' {
                bytes.push(b);
                // checked_add の None 分岐は self.pos == usize::MAX のときだけ発生する
                // panic 不在契約上のガード。不変条件 0 ≦ pos ≦ input.len() のもとでは
                // peek() が先に None を返して break するため理論上到達不能だが、
                // 契約を機械的に守るために明示する（以降の checked_add も同じ理由）。
                let Some(next) = self.pos.checked_add(1) else {
                    self.pos = start;
                    return None;
                };
                self.pos = next;
                continue;
            }

            // '#XX' エスケープ: 直後 2 バイトを ASCII 16 進数字として 1 バイトに復号する
            // （high_bits が上位 4bit、low_bits が下位 4bit を担当する 16 進数字）
            let (Some(high_bits), Some(low_bits)) = (self.peek_at(1), self.peek_at(2)) else {
                self.pos = start;
                return None;
            };
            if !high_bits.is_ascii_hexdigit() || !low_bits.is_ascii_hexdigit() {
                self.pos = start;
                return None;
            }
            let decoded = hex_value(high_bits) * 16 + hex_value(low_bits);
            bytes.push(decoded);
            let Some(next) = self.pos.checked_add(3) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }

        Some(PdfName::new(bytes))
    }

    /// 配列開始デリミタ `[`（ISO 32000-1 §7.3.6）を 1 バイト消費して `Token::ArrayBegin` を返す。
    ///
    /// 受理する字句:
    /// - `[`（0x5B）1 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `[` 以外のすべて（whitespace / 別 delimiter / regular / EOF）
    ///
    /// 巻き戻し: 先頭バイトが `[` でない場合 `pos` を一切動かさず `None` を返すため、
    /// 明示的な巻き戻し処理は不要。
    ///
    /// panic 不在: `peek()` の `Option` と `checked_add(1)` で範囲外を吸収する。
    /// 不変条件 `0 ≦ pos ≦ input.len()` のもとでは `checked_add(1)` の `None` 分岐は
    /// `pos == usize::MAX` のときだけ理論上発生するが、その場合は直前の `peek()` が
    /// `None` を返して早期 return しているため到達不能。契約を機械的に守るため `?` で明示する。
    pub fn read_array_begin(&mut self) -> Option<Token> {
        if self.peek() != Some(b'[') {
            return None;
        }
        self.pos = self.pos.checked_add(1)?;
        Some(Token::ArrayBegin)
    }

    /// 配列終了デリミタ `]`（ISO 32000-1 §7.3.6）を 1 バイト消費して `Token::ArrayEnd` を返す。
    ///
    /// 受理する字句:
    /// - `]`（0x5D）1 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `]` 以外のすべて（whitespace / 別 delimiter / regular / EOF）
    ///
    /// 巻き戻し / panic 不在: `read_array_begin` と同方針。
    pub fn read_array_end(&mut self) -> Option<Token> {
        if self.peek() != Some(b']') {
            return None;
        }
        self.pos = self.pos.checked_add(1)?;
        Some(Token::ArrayEnd)
    }

    /// 辞書開始デリミタ `<<`（ISO 32000-1 §7.3.7）を 2 バイト消費して `Token::DictBegin` を返す。
    ///
    /// 受理する字句:
    /// - `<<`（0x3C 0x3C）2 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `<` 以外（whitespace / 別 delimiter / regular / EOF）
    /// - 先頭が `<` でも 2 バイト目が `<` でない場合（例: `<a`（16 進開始）、`<>`（空 16 進文字列）、`< `、`<` 単独）
    ///
    /// 上記の `<` 単独や `<` + 非 `<` のケースは `read_hex_string` の責務範囲（16 進文字列 / 空 16 進文字列）に
    /// 該当しうるため、本関数は `pos` を一切動かさずに `None` を返すことで `read_hex_string` への
    /// フォールバックを可能にする。
    ///
    /// 巻き戻し: `peek_at(1)` で 2 バイト目を先読みするため、判定で `None` を返すときに `pos` を
    /// 動かす必要はない（先頭バイトを消費しない）。
    ///
    /// panic 不在: `peek()` / `peek_at(1)` は内部で `checked_add` を使い、`checked_add(2)` で
    /// 範囲外を吸収する。
    pub fn read_dict_begin(&mut self) -> Option<Token> {
        if self.peek() != Some(b'<') {
            return None;
        }
        if self.peek_at(1) != Some(b'<') {
            return None;
        }
        self.pos = self.pos.checked_add(2)?;
        Some(Token::DictBegin)
    }

    /// 辞書終了デリミタ `>>`（ISO 32000-1 §7.3.7）を 2 バイト消費して `Token::DictEnd` を返す。
    ///
    /// 受理する字句:
    /// - `>>`（0x3E 0x3E）2 バイトのみ
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 先頭バイトが `>` 以外
    /// - 先頭が `>` でも 2 バイト目が `>` でない場合（`>` 単独 / `>x` / `> ` / `>` + EOF）
    ///
    /// 巻き戻し / panic 不在: `read_dict_begin` と同方針。
    pub fn read_dict_end(&mut self) -> Option<Token> {
        if self.peek() != Some(b'>') {
            return None;
        }
        if self.peek_at(1) != Some(b'>') {
            return None;
        }
        self.pos = self.pos.checked_add(2)?;
        Some(Token::DictEnd)
    }

    /// 連続する regular バイト列を 1 つ読み取り、既知キーワードなら専用 `Token` バリアントに、
    /// それ以外なら `Token::Keyword(Vec<u8>)` として返す（ISO 32000-1 §7.2 / §7.3.2 / §7.3.8 / §7.3.9 / §7.3.10）。
    ///
    /// 受理する字句:
    /// - `ByteKind::is_regular` を満たすバイトの 1 個以上の連続
    /// - 境界は whitespace / delimiter / EOF（バイト境界を越えて消費しない）
    ///
    /// マッピング（case-sensitive 厳守。`True` / `OBJ` 等は平坦化される）:
    /// - `true`      → `Token::Primitive(Primitive::Boolean(true))`
    /// - `false`     → `Token::Primitive(Primitive::Boolean(false))`
    /// - `null`      → `Token::Primitive(Primitive::Null)`
    /// - `obj`       → `Token::ObjBegin`
    /// - `endobj`    → `Token::ObjEnd`
    /// - `stream`    → `Token::StreamBegin`
    /// - `endstream` → `Token::StreamEnd`
    /// - その他（`R` / `xref` / `trailer` / `startxref` / `f` / `n` / `True` / `OBJ` / `trueX` 連結 / 未知バイト列）
    ///   → `Token::Keyword(<収集バイト列>)`
    ///
    /// 拒否する字句（`None` 返却 + `pos` 不変）:
    /// - 空入力 / EOF
    /// - 先頭バイトが whitespace / delimiter
    ///
    /// 巻き戻し: regular バイトを 0 個も収集できなかった場合（先頭が ws / delim / EOF）に
    /// `pos` を一切動かさず `None` を返す。
    ///
    /// panic 不在: `peek()` の `Option` と `checked_add(1)` で範囲外を吸収する。
    /// 実装参照: regular バイト列収集ループは `read_name` の `#XX` エスケープ処理を除いた構造を流用している。
    pub fn read_keyword(&mut self) -> Option<Token> {
        let start = self.pos;
        let mut bytes: Vec<u8> = Vec::new();
        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else { break };
            if ByteKind::is_whitespace(b) || ByteKind::is_delimiter(b) {
                break;
            }
            bytes.push(b);
            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }
        if bytes.is_empty() {
            return None;
        }
        match bytes.as_slice() {
            b"true" => Some(Token::Primitive(Primitive::Boolean(true))),
            b"false" => Some(Token::Primitive(Primitive::Boolean(false))),
            b"null" => Some(Token::Primitive(Primitive::Null)),
            b"obj" => Some(Token::ObjBegin),
            b"endobj" => Some(Token::ObjEnd),
            b"stream" => Some(Token::StreamBegin),
            b"endstream" => Some(Token::StreamEnd),
            _ => Some(Token::Keyword(bytes)),
        }
    }

    /// 次のトークン 1 個を取り出す統合ディスパッチ API（ISO 32000-1 §7.2 / §7.3 全体）。
    ///
    /// 処理順:
    /// 1. `skip_whitespace` で whitespace 6 種のみ消費（コメントは消費しない。`%PDF-1.7` /
    ///    `%%EOF` を parser が拾えるようにするため）
    /// 2. `peek()` で先頭バイトを取得（`None` なら EOF として `None` を返す）
    /// 3. 先頭バイトに応じて以下にディスパッチ:
    ///    - `%`               → `skip_comment` の本文を `to_vec()` で `Token::Comment` に組み立て
    ///    - `[` / `]`         → `read_array_begin` / `read_array_end`
    ///    - `<`               → `read_dict_begin` を先に試行し、`None` なら `read_hex_string` にフォールバック
    ///    - `>`               → `read_dict_end`（`None` ならそのまま `None`）
    ///    - `(`               → `read_literal_string` の戻り値を `Primitive::LiteralString` で包む
    ///    - `/`               → `read_name` の戻り値を `Primitive::Name` で包む
    ///    - `+` / `-` / digit → `read_integer` → 失敗時 `read_real` → 失敗時 `read_keyword`
    ///    - `.`               → `read_real` → 失敗時 `read_keyword`（`.foo` のような `.` 始まりの regular byte 連結を `Token::Keyword` で吸収するため、`+/-` / digit と対称）
    ///    - その他 regular    → `read_keyword`
    ///    - 上記以外          → `None`（pos 不変）
    ///
    /// `<` 分岐の二段構えは安全である（`read_hex_string` が `<<` 入力では `None` + `pos` 不変を
    /// 返すことが既存テストで保証されているため）。`+ABC` のような `+` / `-` 始まりの連結は
    /// `read_integer` / `read_real` が失敗した時点で `read_keyword` に流れ、`Token::Keyword` として吸収される。
    ///
    /// `None` 返却時の EOF / malformed 区別（呼び出し側の責務）:
    /// - `lexer.is_eof()` が `true`  → 真 EOF（入力末尾に到達）
    /// - `lexer.is_eof()` が `false` → malformed input（仕様外バイトが残存）
    ///   - 例: `>` 単独・`{` / `}` のような仕様外 delimiter・`< ` のような `<<` でも 16 進開始
    ///     でもない `<` パターン
    ///   - これらは本層では `None` + `pos` 不変を返すだけで、エラー化しない（panic 不在 /
    ///     エラー型なしの契約）
    ///
    /// `position()` 比較の用途: 「同じ malformed input で `next_token` を再試行したときに
    /// 無限ループしないための no-progress 検知」。malformed と判定した parser は呼び出し前後の
    /// `position()` を比較し、進んでいなければ 1 バイト強制スキップなどのヒューリスティックを
    /// 適用する。EOF / malformed の分類自体には使わない（先頭 `skip_whitespace` のため
    /// whitespace のみ入力で pos が進むなど混在があるため）。
    ///
    /// panic 不在: 各ディスパッチ先（既存 `read_*` / 新規 6 メソッド）がすべて panic 不在
    /// 契約を満たすため、本 API も任意の入力・任意の pos で panic しない。
    ///
    /// 注意: `stream` キーワード直後の改行スキップと stream データ本体（`/Length` バイト分）の
    /// 読み出しは本 API のスコープ外。本層は `Token::StreamBegin` を返すまでが責務。
    pub fn next_token(&mut self) -> Option<Token> {
        self.skip_whitespace();
        let b = self.peek()?;
        match b {
            b'%' => {
                let body = self.skip_comment()?;
                Some(Token::Comment(body.to_vec()))
            }
            b'[' => self.read_array_begin(),
            b']' => self.read_array_end(),
            b'<' => self.read_dict_begin().or_else(|| {
                self.read_hex_string()
                    .map(|bytes| Token::Primitive(Primitive::HexString(bytes)))
            }),
            b'>' => self.read_dict_end(),
            b'(' => self
                .read_literal_string()
                .map(|bytes| Token::Primitive(Primitive::LiteralString(bytes))),
            b'/' => self
                .read_name()
                .map(|name| Token::Primitive(Primitive::Name(name))),
            b'+' | b'-' => self.dispatch_numeric_or_keyword(),
            b'.' => self
                .read_real()
                .map(|r| Token::Primitive(Primitive::Real(r)))
                .or_else(|| self.read_keyword()),
            b if b.is_ascii_digit() => self.dispatch_numeric_or_keyword(),
            b if ByteKind::is_regular(b) => self.read_keyword(),
            _ => None,
        }
    }

    /// 先頭が `+` / `-` / digit のときに使う数値→キーワードへの 3 段フォールバック。
    ///
    /// `next_token` の `+` / `-` 分岐と digit 分岐は ISO 32000-1 §7.3.3 + §7.3.10 の同一
    /// ドメイン（Numeric Objects + Keyword への合流）であり、`read_integer` → `read_real`
    /// → `read_keyword` の優先順位も共通であるため、本ヘルパに集約してチェーンの重複を排除する。
    /// 失敗時は各 `read_*` が `pos` を巻き戻すため呼び出し側で巻き戻し管理は不要。
    fn dispatch_numeric_or_keyword(&mut self) -> Option<Token> {
        self.read_integer()
            .map(|i| Token::Primitive(Primitive::Integer(i)))
            .or_else(|| {
                self.read_real()
                    .map(|r| Token::Primitive(Primitive::Real(r)))
            })
            .or_else(|| self.read_keyword())
    }
}

#[cfg(test)]
mod tests;

#[cfg(test)]
mod peek_token_tests;
