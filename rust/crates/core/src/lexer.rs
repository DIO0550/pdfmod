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
mod literal_string;
pub mod token;

use crate::object::name::PdfName;
use byte_kind::ByteKind;
use eol::EolKind;

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
        let _ = lexer.read_real();
        let _ = lexer.read_name();
        let _ = lexer.read_literal_string();
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
        let _ = lexer.read_real();
        let _ = lexer.read_name();
        let _ = lexer.read_literal_string();
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

    // ---------- Phase 9: read_real ----------

    // Phase 9-D: 整数部 + 小数部（N.M）

    #[test]
    fn read_real_reads_zero_dot_zero() {
        // '0.0' を Some(0.0) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"0.0");
        assert_eq!(lexer.read_real(), Some(0.0));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_real_reads_simple_real_34_5() {
        // '34.5' を Some(34.5) として読み pos を 4 進めることを確認する
        let mut lexer = Lexer::new(b"34.5");
        assert_eq!(lexer.read_real(), Some(34.5));
        assert_eq!(lexer.position(), 4);
    }

    // Phase 9-B: 整数部のみ実数（N.）

    #[test]
    fn read_real_reads_zero_dot() {
        // '0.' を Some(0.0) として読み pos を 2 進めることを確認する
        let mut lexer = Lexer::new(b"0.");
        assert_eq!(lexer.read_real(), Some(0.0));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_real_reads_four_dot() {
        // '4.' を Some(4.0) として読み pos を 2 進めることを確認する
        let mut lexer = Lexer::new(b"4.");
        assert_eq!(lexer.read_real(), Some(4.0));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_real_reads_multi_digit_int_dot() {
        // '123.' を Some(123.0) として読み pos を 4 進めることを確認する
        let mut lexer = Lexer::new(b"123.");
        assert_eq!(lexer.read_real(), Some(123.0));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_real_reads_leading_zeros_int_dot() {
        // '00042.' を Some(42.0) として読み pos を 6 進めることを確認する（先頭ゼロ許容）
        let mut lexer = Lexer::new(b"00042.");
        assert_eq!(lexer.read_real(), Some(42.0));
        assert_eq!(lexer.position(), 6);
    }

    // Phase 9-C: 小数部のみ実数（.N）

    #[test]
    fn read_real_reads_dot_zero() {
        // '.0' を Some(0.0) として読み pos を 2 進めることを確認する
        let mut lexer = Lexer::new(b".0");
        assert_eq!(lexer.read_real(), Some(0.0));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_real_reads_dot_five() {
        // '.5' を Some(0.5) として読み pos を 2 進めることを確認する
        let mut lexer = Lexer::new(b".5");
        assert_eq!(lexer.read_real(), Some(0.5));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_real_reads_dot_zero_one() {
        // '.01' を Some(0.01) 近傍として読み pos を 3 進めることを確認する（先頭ゼロ小数部スケーリング検証）
        let mut lexer = Lexer::new(b".01");
        let v = lexer.read_real().expect("expected Some(0.01)");
        assert!((v - 0.01).abs() < 1e-12, "expected ~0.01, got {v}");
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_real_reads_dot_zero_zero_two() {
        // '.002' を Some(0.002) 近傍として読み pos を 4 進めることを確認する
        let mut lexer = Lexer::new(b".002");
        let v = lexer.read_real().expect("expected Some(0.002)");
        assert!((v - 0.002).abs() < 1e-12, "expected ~0.002, got {v}");
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_real_reads_dot_trailing_zeros() {
        // '.5000' を Some(0.5) として読み pos を 5 進めることを確認する
        let mut lexer = Lexer::new(b".5000");
        assert_eq!(lexer.read_real(), Some(0.5));
        assert_eq!(lexer.position(), 5);
    }

    // Phase 9-D 続き: 整数部 + 小数部の他バリエーション

    #[test]
    fn read_real_reads_one_dot_zero() {
        // '1.0' を Some(1.0) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"1.0");
        assert_eq!(lexer.read_real(), Some(1.0));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_real_reads_123_456() {
        // '123.456' を Some(123.456) 近傍として読み pos を 7 進めることを確認する
        let mut lexer = Lexer::new(b"123.456");
        let v = lexer.read_real().expect("expected Some(123.456)");
        assert!((v - 123.456).abs() < 1e-9, "expected ~123.456, got {v}");
        assert_eq!(lexer.position(), 7);
    }

    #[test]
    fn read_real_reads_int_with_trailing_zero_fraction() {
        // '7.00' を Some(7.0) として読み pos を 4 進めることを確認する
        let mut lexer = Lexer::new(b"7.00");
        assert_eq!(lexer.read_real(), Some(7.0));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_real_reads_zero_with_long_fraction() {
        // '0.000001' を Some(0.000001) 近傍として読み pos を 8 進めることを確認する
        let mut lexer = Lexer::new(b"0.000001");
        let v = lexer.read_real().expect("expected Some(0.000001)");
        assert!((v - 0.000001).abs() < 1e-12, "expected ~0.000001, got {v}");
        assert_eq!(lexer.position(), 8);
    }

    // Phase 9-E: 符号付き実数（±N.M / ±.M / ±N.）

    #[test]
    fn read_real_reads_plus_zero_dot_zero() {
        // '+0.0' を Some(0.0) として読み pos を 4 進めることを確認する
        let mut lexer = Lexer::new(b"+0.0");
        assert_eq!(lexer.read_real(), Some(0.0));
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_real_reads_minus_zero_dot_zero() {
        // '-0.0' を Some(-0.0) として読み pos を 4 進めることを確認する（符号ビット保持）
        let mut lexer = Lexer::new(b"-0.0");
        let v = lexer.read_real().expect("expected Some(-0.0)");
        assert_eq!(v, -0.0);
        assert!(v.is_sign_negative(), "expected negative zero sign bit");
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_real_reads_plus_123_6() {
        // '+123.6' を Some(123.6) 近傍として読み pos を 6 進めることを確認する
        let mut lexer = Lexer::new(b"+123.6");
        let v = lexer.read_real().expect("expected Some(123.6)");
        assert!((v - 123.6).abs() < 1e-9, "expected ~123.6, got {v}");
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_real_reads_minus_3_62() {
        // '-3.62' を Some(-3.62) 近傍として読み pos を 5 進めることを確認する
        let mut lexer = Lexer::new(b"-3.62");
        let v = lexer.read_real().expect("expected Some(-3.62)");
        assert!((v - (-3.62)).abs() < 1e-9, "expected ~-3.62, got {v}");
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_real_reads_plus_dot_5() {
        // '+.5' を Some(0.5) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"+.5");
        assert_eq!(lexer.read_real(), Some(0.5));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_real_reads_minus_dot_002() {
        // '-.002' を Some(-0.002) 近傍として読み pos を 5 進めることを確認する
        let mut lexer = Lexer::new(b"-.002");
        let v = lexer.read_real().expect("expected Some(-0.002)");
        assert!((v - (-0.002)).abs() < 1e-12, "expected ~-0.002, got {v}");
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_real_reads_plus_4_dot() {
        // '+4.' を Some(4.0) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"+4.");
        assert_eq!(lexer.read_real(), Some(4.0));
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_real_reads_minus_4_dot() {
        // '-4.' を Some(-4.0) として読み pos を 3 進めることを確認する
        let mut lexer = Lexer::new(b"-4.");
        assert_eq!(lexer.read_real(), Some(-4.0));
        assert_eq!(lexer.position(), 3);
    }

    // Phase 9-F: トークン境界（後続 ws/delim/EOF）

    #[test]
    fn read_real_stops_at_space() {
        // '34.5 rest' を Some(34.5)・pos 4 として読み peek が ' ' を指すことを確認する
        let mut lexer = Lexer::new(b"34.5 rest");
        assert_eq!(lexer.read_real(), Some(34.5));
        assert_eq!(lexer.position(), 4);
        assert_eq!(lexer.peek(), Some(b' '));
    }

    #[test]
    fn read_real_stops_at_lf() {
        // '34.5\nrest' を Some(34.5)・pos 4 として読み peek が '\n' を指すことを確認する
        let mut lexer = Lexer::new(b"34.5\nrest");
        assert_eq!(lexer.read_real(), Some(34.5));
        assert_eq!(lexer.position(), 4);
        assert_eq!(lexer.peek(), Some(b'\n'));
    }

    #[test]
    fn read_real_stops_at_cr() {
        // '34.5\rrest' を Some(34.5)・pos 4 として読み peek が '\r' を指すことを確認する
        let mut lexer = Lexer::new(b"34.5\rrest");
        assert_eq!(lexer.read_real(), Some(34.5));
        assert_eq!(lexer.position(), 4);
        assert_eq!(lexer.peek(), Some(b'\r'));
    }

    #[test]
    fn read_real_stops_at_right_bracket() {
        // '5.7]rest' を Some(5.7) 近傍・pos 3 として読み peek が ']' を指すことを確認する
        let mut lexer = Lexer::new(b"5.7]rest");
        let v = lexer.read_real().expect("expected Some(5.7)");
        assert!((v - 5.7).abs() < 1e-12, "expected ~5.7, got {v}");
        assert_eq!(lexer.position(), 3);
        assert_eq!(lexer.peek(), Some(b']'));
    }

    #[test]
    fn read_real_stops_at_eof() {
        // '5.7' 単独で Some(5.7) 近傍・pos 3 として読み EOF に達することを確認する
        let mut lexer = Lexer::new(b"5.7");
        let v = lexer.read_real().expect("expected Some(5.7)");
        assert!((v - 5.7).abs() < 1e-12, "expected ~5.7, got {v}");
        assert_eq!(lexer.position(), 3);
        assert!(lexer.is_eof());
    }

    #[test]
    fn read_real_stops_at_every_trailing_whitespace_byte() {
        // '5.7' + whitespace 6 種の全組で Some(5.7) 近傍・pos 3 で停止することを確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for w in whitespace_bytes {
            let input = [b'5', b'.', b'7', w];
            let mut lexer = Lexer::new(&input);
            let v = lexer
                .read_real()
                .unwrap_or_else(|| panic!("whitespace 0x{w:02X} should yield Some(5.7)"));
            assert!(
                (v - 5.7).abs() < 1e-12,
                "whitespace 0x{w:02X} expected ~5.7, got {v}"
            );
            assert_eq!(lexer.position(), 3, "whitespace 0x{w:02X} should stop at 3");
        }
    }

    #[test]
    fn read_real_stops_at_every_trailing_delimiter_byte() {
        // '5.7' + delimiter 10 種の全組で Some(5.7) 近傍・pos 3 で停止することを確認する
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for d in delimiter_bytes {
            let input = [b'5', b'.', b'7', d];
            let mut lexer = Lexer::new(&input);
            let v = lexer
                .read_real()
                .unwrap_or_else(|| panic!("delimiter 0x{d:02X} should yield Some(5.7)"));
            assert!(
                (v - 5.7).abs() < 1e-12,
                "delimiter 0x{d:02X} expected ~5.7, got {v}"
            );
            assert_eq!(lexer.position(), 3, "delimiter 0x{d:02X} should stop at 3");
        }
    }

    #[test]
    fn read_real_stops_at_trailing_whitespace_after_int_dot() {
        // '4. rest' を Some(4.0)・pos 2 として読むことを確認する
        let mut lexer = Lexer::new(b"4. rest");
        assert_eq!(lexer.read_real(), Some(4.0));
        assert_eq!(lexer.position(), 2);
    }

    #[test]
    fn read_real_stops_at_trailing_delimiter_after_dot_frac() {
        // '.5]rest' を Some(0.5)・pos 2 として読むことを確認する
        let mut lexer = Lexer::new(b".5]rest");
        assert_eq!(lexer.read_real(), Some(0.5));
        assert_eq!(lexer.position(), 2);
    }

    // Phase 9-A: 早期 None（先頭バイト不適合）

    #[test]
    fn read_real_returns_none_for_empty_input() {
        // 空入力で None・pos 0 のままを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_at_eof() {
        // EOF 状態で None・pos 不変を確認する
        let mut lexer = Lexer::new(b"a");
        lexer.advance();
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_real_returns_none_for_non_digit_non_dot_non_sign_regular_byte() {
        // 先頭が 'x' / 'a' / 'A' 等の regular byte で None・pos 0 を確認する
        for byte in [b'x', b'a', b'A'] {
            let input = [byte, b'1', b'2'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_real(),
                None,
                "leading regular byte 0x{byte:02X} should yield None"
            );
            assert_eq!(
                lexer.position(),
                0,
                "leading regular byte 0x{byte:02X} should keep pos 0"
            );
        }
    }

    #[test]
    fn read_real_returns_none_for_lone_plus_at_eof() {
        // '+' 1 バイトのみで None・pos 0 を確認する
        let mut lexer = Lexer::new(b"+");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_lone_minus_at_eof() {
        // '-' 1 バイトのみで None・pos 0 を確認する
        let mut lexer = Lexer::new(b"-");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_lone_dot_at_eof() {
        // '.' 1 バイトのみで None・pos 0 を確認する（数字無しの '.' 単独は実数ではない）
        let mut lexer = Lexer::new(b".");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_plus_dot_eof() {
        // '+.' で None・pos 0 を確認する（直後に数字なし）
        let mut lexer = Lexer::new(b"+.");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_minus_dot_eof() {
        // '-.' で None・pos 0 を確認する（直後に数字なし）
        let mut lexer = Lexer::new(b"-.");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_every_leading_whitespace_byte() {
        // 仕様 §2.1 の whitespace 6 バイト全てを先頭に置いた場合、各々 None・pos 0 を確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for w in whitespace_bytes {
            let input = [w, b'1', b'.', b'2'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_real(),
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
    fn read_real_returns_none_for_every_leading_delimiter_byte() {
        // 仕様 §2.2 の delimiter 10 バイト全てを先頭に置いた場合、各々 None・pos 0 を確認する
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for d in delimiter_bytes {
            let input = [d, b'1', b'.', b'2'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_real(),
                None,
                "delimiter 0x{d:02X} should yield None"
            );
            assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
        }
    }

    #[test]
    fn read_real_returns_none_for_sign_then_every_whitespace_byte() {
        // 符号 ∈ {+, -} × whitespace 6 種の全 12 組で None・pos 0 を確認する
        let signs = [b'+', b'-'];
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for s in signs {
            for w in whitespace_bytes {
                let input = [s, w];
                let mut lexer = Lexer::new(&input);
                assert_eq!(
                    lexer.read_real(),
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

    #[test]
    fn read_real_returns_none_for_sign_then_every_delimiter_byte() {
        // 符号 ∈ {+, -} × delimiter 10 種の全 20 組で None・pos 0 を確認する
        let signs = [b'+', b'-'];
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for s in signs {
            for d in delimiter_bytes {
                let input = [s, d];
                let mut lexer = Lexer::new(&input);
                assert_eq!(
                    lexer.read_real(),
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

    // Phase 9-G: 指数表記の拒否 + 複数小数点拒否 + '.' 不在拒否

    #[test]
    fn read_real_returns_none_for_exponent_lowercase_e() {
        // '1.2e3' は指数表記として拒否（ISO 32000-1 仕様外）。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1.2e3");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_exponent_uppercase_e() {
        // '1.2E3' は指数表記として拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1.2E3");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_exponent_int_only() {
        // '1e2' は整数部のみ + 指数で拒否（'.' 不在 + 指数）。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1e2");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_dot_frac_then_exponent() {
        // '.5e3' は小数部側 + 指数で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b".5e3");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_int_dot_then_exponent() {
        // '1.e3' は末尾ドット + 指数で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1.e3");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_two_dots_consecutive() {
        // '..' は 2 個目の '.' で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"..");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_int_two_dots() {
        // '1..2' は 2 個目の '.' で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1..2");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_two_dots_in_real() {
        // '1.2.3' は 2 個目の '.' で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1.2.3");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_real_with_letters() {
        // '1.2abc' は数字途中で非数字 regular byte 'a' を検出し拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"1.2abc");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_signed_with_letters() {
        // '-12x' は数字 '12' の後に非数字 'x' が続き '.' を含まないため実数として不正。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"-12x");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_unsigned_integer_only() {
        // '123' は '.' を含まない整数のみ入力で拒否（read_integer 責務）。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"123");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_single_digit_only() {
        // '0' 単独は '.' 不在で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"0");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_plus_integer_only() {
        // '+45' は '.' 不在で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"+45");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_minus_integer_only() {
        // '-7' は '.' 不在で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"-7");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_leading_zeros_integer_only() {
        // '00042' は '.' 不在で拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"00042");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_integer_followed_by_whitespace() {
        // '123 rest' は ws までで '.' 不在のため拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"123 rest");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_real_returns_none_for_integer_followed_by_delimiter() {
        // '42]rest' は delim までで '.' 不在のため拒否。None・pos 0 を確認する
        let mut lexer = Lexer::new(b"42]rest");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 9-H: IEEE 754 関連（±0.0 の符号保持）

    #[test]
    fn read_real_preserves_negative_zero_sign_bit() {
        // '-0.0' の戻り値は f64::is_sign_negative == true（負ゼロ符号ビット保持）
        let mut lexer = Lexer::new(b"-0.0");
        let v = lexer.read_real().expect("expected Some(-0.0)");
        assert!(v.is_sign_negative(), "expected negative zero sign bit");
    }

    #[test]
    fn read_real_preserves_positive_zero_sign_bit() {
        // '+0.0' の戻り値は f64::is_sign_negative == false（正ゼロ）
        let mut lexer = Lexer::new(b"+0.0");
        let v = lexer.read_real().expect("expected Some(0.0)");
        assert!(!v.is_sign_negative(), "expected positive zero sign bit");
    }

    #[test]
    fn read_real_unsigned_zero_is_positive_zero() {
        // '0.0' は符号無しなので f64::is_sign_negative == false（正ゼロ）
        let mut lexer = Lexer::new(b"0.0");
        let v = lexer.read_real().expect("expected Some(0.0)");
        assert!(!v.is_sign_negative(), "expected positive zero sign bit");
    }

    #[test]
    fn read_real_always_returns_finite_value() {
        // 受理形すべてで戻り値が is_finite() == true であることを確認する
        let inputs: &[&[u8]] = &[
            b"0.0",
            b"34.5",
            b"+0.0",
            b"-0.0",
            b"123.456",
            b"-3.62",
            b".5",
            b"-.002",
            b"4.",
            b"+4.",
            b"0.000001",
        ];
        for input in inputs {
            let mut lexer = Lexer::new(input);
            let v = lexer
                .read_real()
                .unwrap_or_else(|| panic!("input {input:?} should yield Some"));
            assert!(
                v.is_finite(),
                "input {input:?} should yield finite value, got {v}"
            );
        }
    }

    // Phase 9-I: pos 巻き戻し（中間位置 / 部分失敗ロールバック）

    #[test]
    fn read_real_succeeds_at_mid_buffer_and_advances_pos_correctly() {
        // 'x1.2' で 'x' を advance 後（pos == 1）に read_real を呼び Some(1.2) 近傍・pos == 4 を確認する
        let mut lexer = Lexer::new(b"x1.2");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        let v = lexer.read_real().expect("expected Some(1.2)");
        assert!((v - 1.2).abs() < 1e-12, "expected ~1.2, got {v}");
        assert_eq!(lexer.position(), 4);
    }

    #[test]
    fn read_real_failure_at_mid_buffer_with_invalid_input_rolls_back() {
        // 'x1.2.3' で 'x' を advance 後（pos == 1）に read_real を呼ぶと None・pos が呼び出し前位置 1 に厳密復元されることを確認する
        let mut lexer = Lexer::new(b"x1.2.3");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_real_partial_consume_then_reject_rolls_back() {
        // 'x1.2e3' で 'x' を advance 後（pos == 1）に呼び出し、1.2 まで読んだ後 'e' で拒否されて pos が呼び出し前位置 1 に厳密復元されることを確認する
        let mut lexer = Lexer::new(b"x1.2e3");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_real_sign_then_invalid_rolls_back_to_start() {
        // '+x' は '+' 消費後に 'x' で拒否。pos が 0 に巻き戻ることを確認する
        let mut lexer = Lexer::new(b"+x");
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 9-J: 大桁数（精度劣化を許容しつつ panic 不在 + 有限値）

    #[test]
    fn read_real_handles_long_integer_part_without_panic() {
        // 整数部 50 桁（'9' x 50 + '.0'）で panic せず Some(有限値) を返し pos が入力末尾に進むことを確認する
        let mut input = vec![b'9'; 50];
        input.extend_from_slice(b".0");
        let mut lexer = Lexer::new(&input);
        let v = lexer.read_real().expect("expected Some for 50-digit int");
        assert!(v.is_finite(), "expected finite, got {v}");
        assert_eq!(
            lexer.position(),
            input.len(),
            "expected pos to reach end of input"
        );
    }

    #[test]
    fn read_real_handles_long_fractional_part_without_panic() {
        // 小数部 50 桁（'0.' + '0' x 49 + '1'）で panic せず Some(有限値) を返し pos が入力末尾に進むことを確認する
        let mut input = vec![b'0', b'.'];
        input.extend(std::iter::repeat_n(b'0', 49));
        input.push(b'1');
        let mut lexer = Lexer::new(&input);
        let v = lexer.read_real().expect("expected Some for 50-digit frac");
        assert!(v.is_finite(), "expected finite, got {v}");
        assert_eq!(
            lexer.position(),
            input.len(),
            "expected pos to reach end of input"
        );
    }

    #[test]
    fn read_real_handles_very_long_input_without_panic() {
        // 整数部 100 桁 + 小数部 100 桁で panic せず Some(有限値) を返し pos が入力末尾に進むことを確認する
        let mut input = vec![b'9'; 100];
        input.push(b'.');
        input.extend(std::iter::repeat_n(b'1', 100));
        let mut lexer = Lexer::new(&input);
        let v = lexer
            .read_real()
            .expect("expected Some for 100+100 digit real");
        assert!(v.is_finite(), "expected finite, got {v}");
        assert_eq!(
            lexer.position(),
            input.len(),
            "expected pos to reach end of input"
        );
    }

    #[test]
    fn read_real_rejects_infinity_saturated_input() {
        // 整数部 400 桁 + '.0' は f64 が Inf に飽和するため None・pos 0 に巻き戻されることを確認する
        let mut input = vec![b'9'; 400];
        input.extend_from_slice(b".0");
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_real(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 9-K: 結合テスト（dispatcher パターン契約）

    #[test]
    fn read_integer_then_read_real_dispatcher_pattern_for_real() {
        // '5.7' に対し read_integer() が None && pos == 0 で巻き戻し、続けて read_real() が Some(5.7) 近傍 + pos == 3 となる対称契約を確認する
        let mut lexer = Lexer::new(b"5.7");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
        let v = lexer.read_real().expect("expected Some(5.7)");
        assert!((v - 5.7).abs() < 1e-12, "expected ~5.7, got {v}");
        assert_eq!(lexer.position(), 3);
    }

    #[test]
    fn read_integer_then_read_real_dispatcher_pattern_for_signed_real() {
        // '-.002' に対し read_integer() が None && pos == 0、続けて read_real() が Some(-0.002) 近傍 + pos == 5 となる契約を確認する
        let mut lexer = Lexer::new(b"-.002");
        assert_eq!(lexer.read_integer(), None);
        assert_eq!(lexer.position(), 0);
        let v = lexer.read_real().expect("expected Some(-0.002)");
        assert!((v - (-0.002)).abs() < 1e-12, "expected ~-0.002, got {v}");
        assert_eq!(lexer.position(), 5);
    }

    // ---------- Phase 10: read_name ----------

    // Phase 10-A: 早期 None（先頭バイトが '/' でない / EOF / 空）

    #[test]
    fn read_name_returns_none_for_empty_input() {
        // 空入力で read_name が None を返し pos が 0 のままであることを確認する
        let mut lexer = Lexer::new(&[]);
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_returns_none_at_eof() {
        // EOF 状態の read_name が None を返し pos 不変であることを確認する
        let mut lexer = Lexer::new(b"a");
        lexer.advance();
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_name_returns_none_for_non_slash_leading_byte() {
        // 先頭が '/' でない 'abc' で None を返し pos 0 のままであることを確認する
        let mut lexer = Lexer::new(b"abc");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_returns_none_for_every_leading_whitespace_byte() {
        // 仕様 §2.1 の whitespace 6 バイトを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for w in whitespace_bytes {
            let input = [w, b'T', b'y', b'p', b'e'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_name(),
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
    fn read_name_returns_none_for_every_leading_delimiter_byte() {
        // 仕様 §2.2 の delimiter のうち '/' 以外 9 バイトを先頭に置いた場合、各々 None・pos 0 で停止することを確認する
        // ('/' は 10-F で空名前として別途検証)
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x25];
        for d in delimiter_bytes {
            let input = [d, b'T', b'y', b'p', b'e'];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_name(),
                None,
                "delimiter 0x{d:02X} should yield None"
            );
            assert_eq!(lexer.position(), 0, "delimiter 0x{d:02X} should keep pos 0");
        }
    }

    // Phase 10-B: 基本 ASCII 名前

    #[test]
    fn read_name_reads_simple_ascii_name() {
        // '/Type' (EOF 終端) で Some(b"Type")・pos == 5 を確認する
        let mut lexer = Lexer::new(b"/Type");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_name_reads_subtype_name() {
        // 桁数の三角測量: '/Subtype' で Some(b"Subtype")・pos == 8 を確認する
        let mut lexer = Lexer::new(b"/Subtype");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"Subtype".to_vec())));
        assert_eq!(lexer.position(), 8);
    }

    #[test]
    fn read_name_reads_single_letter_name() {
        // 三角測量: '/A' 単一文字で Some(b"A")・pos == 2 を確認する
        let mut lexer = Lexer::new(b"/A");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"A".to_vec())));
        assert_eq!(lexer.position(), 2);
    }

    // Phase 10-C: #XX エスケープ単発

    #[test]
    fn read_name_decodes_uppercase_hex_escape() {
        // '/A#42' (#42='B') で Some(b"AB")・pos == 5 を確認する
        let mut lexer = Lexer::new(b"/A#42");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"AB".to_vec())));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_name_decodes_lowercase_hex_escape() {
        // '/a#ff' (#ff=0xFF) で Some(b"a\xFF")・pos == 5 を確認する
        let mut lexer = Lexer::new(b"/a#ff");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"a\xFF".to_vec())));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_name_decodes_mixed_case_hex_escape() {
        // '/a#fF' 大小混在で Some(b"a\xFF")・pos == 5 を確認する
        let mut lexer = Lexer::new(b"/a#fF");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"a\xFF".to_vec())));
        assert_eq!(lexer.position(), 5);
    }

    #[test]
    fn read_name_decodes_whitespace_byte_via_escape() {
        // '/Hello#20World' (#20=space) で Some(b"Hello World")・pos == 14 を確認する（境界判定は生バイトのみ）
        let mut lexer = Lexer::new(b"/Hello#20World");
        assert_eq!(
            lexer.read_name(),
            Some(PdfName::new(b"Hello World".to_vec()))
        );
        assert_eq!(lexer.position(), 14);
    }

    #[test]
    fn read_name_decodes_delimiter_byte_via_escape() {
        // '/A#28B' (#28='(') で Some(b"A(B")・pos == 6 を確認する
        let mut lexer = Lexer::new(b"/A#28B");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"A(B".to_vec())));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_name_decodes_nul_byte_via_escape() {
        // '/A#00B' (#00=NUL) で Some(b"A\x00B")・pos == 6 を確認する（任意バイト 0x00 受理）
        let mut lexer = Lexer::new(b"/A#00B");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"A\x00B".to_vec())));
        assert_eq!(lexer.position(), 6);
    }

    // Phase 10-D: #XX エスケープ複数

    #[test]
    fn read_name_decodes_consecutive_escapes() {
        // '/paired#28#29parentheses' で連続エスケープを復号し Some(b"paired()parentheses")・pos == 24 を確認する
        let mut lexer = Lexer::new(b"/paired#28#29parentheses");
        assert_eq!(
            lexer.read_name(),
            Some(PdfName::new(b"paired()parentheses".to_vec()))
        );
        assert_eq!(lexer.position(), 24);
    }

    #[test]
    fn read_name_decodes_escape_then_regular_then_escape() {
        // '/A#42C#43' (#42='B', #43='C') で Some(b"ABCC")・pos == 9 を確認する
        let mut lexer = Lexer::new(b"/A#42C#43");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"ABCC".to_vec())));
        assert_eq!(lexer.position(), 9);
    }

    // Phase 10-E: 終端境界

    #[test]
    fn read_name_stops_at_every_trailing_whitespace_byte() {
        // '/Type' + whitespace 6 種の全組で Some(b"Type")・pos == 5 で停止することを確認する
        let whitespace_bytes = [0x00, 0x09, 0x0A, 0x0C, 0x0D, 0x20];
        for w in whitespace_bytes {
            let input = [b'/', b'T', b'y', b'p', b'e', w];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_name(),
                Some(PdfName::new(b"Type".to_vec())),
                "whitespace 0x{w:02X} should yield Some(b\"Type\")"
            );
            assert_eq!(lexer.position(), 5, "whitespace 0x{w:02X} should stop at 5");
        }
    }

    #[test]
    fn read_name_stops_at_every_trailing_delimiter_byte() {
        // '/Type' + delimiter 10 種の全組で Some(b"Type")・pos == 5 で停止することを確認する
        let delimiter_bytes = [0x28, 0x29, 0x3C, 0x3E, 0x5B, 0x5D, 0x7B, 0x7D, 0x2F, 0x25];
        for d in delimiter_bytes {
            let input = [b'/', b'T', b'y', b'p', b'e', d];
            let mut lexer = Lexer::new(&input);
            assert_eq!(
                lexer.read_name(),
                Some(PdfName::new(b"Type".to_vec())),
                "delimiter 0x{d:02X} should yield Some(b\"Type\")"
            );
            assert_eq!(lexer.position(), 5, "delimiter 0x{d:02X} should stop at 5");
        }
    }

    #[test]
    fn read_name_stops_at_eof() {
        // '/Type' (EOF 終端) で Some(b"Type")・pos == 5・is_eof() を確認する
        let mut lexer = Lexer::new(b"/Type");
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
        assert_eq!(lexer.position(), 5);
        assert!(lexer.is_eof());
    }

    // Phase 10-F: 空名前 '/'

    #[test]
    fn read_name_returns_empty_name_at_eof() {
        // '/' 単独で Some(b"")・pos == 1・is_eof() を確認する（空名前受理）
        let mut lexer = Lexer::new(b"/");
        assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
        assert_eq!(lexer.position(), 1);
        assert!(lexer.is_eof());
    }

    #[test]
    fn read_name_returns_empty_name_before_whitespace() {
        // '/ rest' で Some(b"")・pos == 1 を確認する
        let mut lexer = Lexer::new(b"/ rest");
        assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_name_returns_empty_name_before_delimiter() {
        // '/[' で Some(b"")・pos == 1 を確認する
        let mut lexer = Lexer::new(b"/[");
        assert_eq!(lexer.read_name(), Some(PdfName::new(Vec::new())));
        assert_eq!(lexer.position(), 1);
    }

    // Phase 10-G: 不正 #XX エスケープ（巻き戻し検証）

    #[test]
    fn read_name_rejects_hash_at_eof() {
        // '/A#' (# のあと EOF) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_one_hex_then_eof() {
        // '/A#1' (#1 のあと EOF) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#1");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_non_hex_high() {
        // '/A#Z' (高位が非16進) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#Z");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_non_hex_low() {
        // '/A#1Z' (低位が非16進) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#1Z");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_whitespace_low() {
        // '/A#1 ' (低位が space) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#1 ");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_delimiter_low() {
        // '/A#1/' (低位が '/') で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#1/");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_nul_low() {
        // '/A#1\0' (低位が NUL = is_ascii_hexdigit false) で None・pos == 0 巻き戻しを確認する
        let input = [b'/', b'A', b'#', b'1', 0x00];
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_whitespace_high() {
        // '/A# ' (高位が space = is_ascii_hexdigit false) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A# ");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_delimiter_high() {
        // '/A#/' (高位が '/' = is_ascii_hexdigit false) で None・pos == 0 巻き戻しを確認する
        let mut lexer = Lexer::new(b"/A#/");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    #[test]
    fn read_name_rejects_hash_with_non_hex_high_and_low() {
        // '/A#GG' (高位・低位とも非16進) で None・pos == 0 巻き戻しを確認する（TS readName バグの代表入力）
        let mut lexer = Lexer::new(b"/A#GG");
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 0);
    }

    // Phase 10-H: 長名前（仕様推奨上限 127 バイトを超えても受理）

    #[test]
    fn read_name_accepts_200_byte_ascii_name() {
        // '/' + 'A' × 200 で Some([b'A'; 200])・pos == 201 を確認する（推奨上限非強制）
        let mut input = Vec::with_capacity(201);
        input.push(b'/');
        input.extend(std::iter::repeat_n(b'A', 200));
        let mut lexer = Lexer::new(&input);
        assert_eq!(lexer.read_name(), Some(PdfName::new([b'A'; 200].to_vec())));
        assert_eq!(lexer.position(), 201);
    }

    // Phase 10-I: 中間位置呼び出し（advance 後の起点）

    #[test]
    fn read_name_at_mid_buffer_succeeds_after_advance() {
        // 'x/Type ' で advance 後 (pos == 1) に呼び Some(b"Type")・pos == 6 を確認する
        let mut lexer = Lexer::new(b"x/Type ");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.read_name(), Some(PdfName::new(b"Type".to_vec())));
        assert_eq!(lexer.position(), 6);
    }

    #[test]
    fn read_name_failure_at_mid_buffer_rolls_back_to_call_site() {
        // 'xabc' で advance 後 (pos == 1) に呼び None・pos == 1 巻き戻しを確認する
        let mut lexer = Lexer::new(b"xabc");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 1);
    }

    #[test]
    fn read_name_invalid_escape_at_mid_buffer_rolls_back_to_call_site() {
        // 'x/A#' で advance 後 (pos == 1) に不正エスケープ → pos == 1 巻き戻しを確認する
        let mut lexer = Lexer::new(b"x/A#");
        lexer.advance();
        assert_eq!(lexer.position(), 1);
        assert_eq!(lexer.read_name(), None);
        assert_eq!(lexer.position(), 1);
    }
}
