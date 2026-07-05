//! ISO 32000 §7.2.2 のホワイトスペース 6 バイトと `%` コメントの
//! スキップ API を提供する。改行は `EolKind` で 1 単位として扱う。

use super::byte_kind::ByteKind;
use super::eol::EolKind;
use super::Lexer;

impl<'a> Lexer<'a> {
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
}
