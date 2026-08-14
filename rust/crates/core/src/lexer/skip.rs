//! ISO 32000 §7.2.2 のホワイトスペース 6 バイトと `%` コメントの
//! スキップ API を提供する。改行は `EolKind` で 1 単位として扱う。
//!
//! 概念の本体は「走査範囲 `pos..end` を受ける純粋関数」の側に置く。ファイル構造層
//! （`file::startxref` など）は `%%EOF` の手前までのように**終端を区切って**読み飛ばす
//! 必要があり、`&mut Lexer` の形では表現できないため。`Lexer` のメソッドは
//! `end = input.len()` を渡すだけの薄いラッパとして同じ実装を共有する。

use super::byte_kind::ByteKind;
use super::eol::EolKind;
use super::Lexer;

/// コメント行の開始バイト `%`。
const PERCENT: u8 = b'%';

/// `pos` から `end` までのホワイトスペースを読み飛ばした位置を返す。
///
/// CR と LF を独立した whitespace バイトとして 1 バイトずつ消費するだけで、改行（EOL）
/// という概念は扱わない。改行を 1 単位として扱う必要がある場合は `EolKind` を使うこと。
pub(crate) fn skip_whitespace(data: &[u8], pos: usize, end: usize) -> usize {
    let mut cursor = pos;
    while cursor < end {
        let Some(&byte) = data.get(cursor) else {
            break;
        };
        if !ByteKind::is_whitespace(byte) {
            break;
        }
        cursor = cursor.saturating_add(1);
    }
    cursor
}

/// `pos` から `end` までのホワイトスペースとコメントを読み飛ばした位置を返す。
///
/// ISO 32000-1 §7.2.4 の「コメントは 1 個のホワイトスペースとして扱う」に対応する。
/// コメント本文は破棄し、終端の EOL はホワイトスペースとして読み飛ばす。
pub(crate) fn skip_whitespace_and_comments(data: &[u8], pos: usize, end: usize) -> usize {
    let mut cursor = pos;
    while cursor < end {
        cursor = skip_whitespace(data, cursor, end);
        if data.get(cursor).copied() != Some(PERCENT) {
            break;
        }
        cursor = comment_body_end(data, cursor, end);
    }
    cursor
}

/// `%` から始まるコメントの本文終端（EOL の直前、または `end`）を返す。
///
/// 終端の EOL は消費しない。EOL を跨ぐかどうかは呼び出し側の文脈で決まるため
/// （`skip_whitespace_and_comments` はホワイトスペースとして跨ぎ、`Lexer::skip_comment` は
/// `EolKind::byte_len` の分だけ跨ぐ）、境界の決定をこの関数の責務にしない。
pub(crate) fn comment_body_end(data: &[u8], pos: usize, end: usize) -> usize {
    let mut cursor = pos;
    while cursor < end {
        if EolKind::at(data, cursor).is_some() {
            break;
        }
        cursor = cursor.saturating_add(1);
    }
    cursor
}

impl<'a> Lexer<'a> {
    /// ISO 32000 のホワイトスペース 6 バイト（NUL/TAB/LF/FF/CR/SP）を連続して読み飛ばす。
    ///
    /// 非ホワイトスペースバイトまたは EOF に到達したら停止する。本関数は CR と LF を
    /// 独立した whitespace バイトとして 1 バイトずつ消費するだけで、改行（EOL）という
    /// 概念は扱わない。改行を 1 単位として扱う必要がある場合（CRLF を 2 改行と数えない
    /// 等）は本関数ではなく `EolKind::at` / `byte_len` を用いること（`skip_comment` 側で
    /// この方針を担保している）。
    pub fn skip_whitespace(&mut self) {
        self.pos = skip_whitespace(self.input, self.pos, self.input.len());
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
        if self.peek() != Some(PERCENT) {
            return None;
        }
        let body_start = self.pos.checked_add(1)?;
        let body_end = comment_body_end(self.input, body_start, self.input.len());
        self.pos = match EolKind::at(self.input, body_end) {
            Some(eol) => body_end
                .checked_add(eol.byte_len())
                .unwrap_or(self.input.len()),
            None => body_end,
        };
        self.input.get(body_start..body_end)
    }

    /// ホワイトスペースとコメントを交互に・連続してすべて読み飛ばす。
    ///
    /// `peek()` がホワイトスペースでも `%` でもないバイトを指すか、EOF に達したら停止。
    /// コメント本文は破棄する。
    pub fn skip_whitespace_and_comments(&mut self) {
        self.pos = skip_whitespace_and_comments(self.input, self.pos, self.input.len());
    }
}
