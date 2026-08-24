//! ファイル末尾の `startxref` / `%%EOF` を後方スキャンし、最初に読む xref テーブルの
//! バイトオフセットを取得するモジュール（`docs/specs/02_file_structure.md` §5.1, §6）。
//!
//! PDF は末尾から逆方向に解析を始める。`%%EOF` はインクリメンタルアップデートにより
//! 複数存在しうるため、**最も後ろの** `%%EOF` を採用する。`%%EOF` の後ろに付いた
//! 余剰バイトは走査上限の内側にある限り許容し、EOL は CR / LF / CRLF を区別しない。
//!
//! 走査は末尾 `SCAN_LIMIT` バイトに限定する。TypeScript 実装
//! （`packages/core/src/xref/startxref/scanner/index.ts`）は `startxref` の探索だけ
//! ファイル先頭まで無制限に遡るが、本実装は Issue #582 の「巨大ファイルでも全体を
//! 走査しない」要件を優先し、`startxref` も同じ窓の内側でのみ探す。

use crate::byte_offset::ByteOffset;
use crate::error::pdf_error::PdfError;
use crate::error::pdf_error_code::PdfErrorCode;
use crate::lexer::byte_kind::ByteKind;
use crate::lexer::eol::EolKind;
use crate::lexer::skip::skip_whitespace_and_comments;
use crate::lexer::token::Keyword;

/// ファイル終端マーカー。この直前に `startxref` 行が置かれる。
const EOF_MARKER: &[u8] = b"%%EOF";
/// 末尾から遡って走査する上限バイト数。
///
/// `docs/specs/02_file_structure.md` §6 の「末尾から最大 1024 バイト」に対応する。
/// TypeScript 実装の `STARTXREF_SEARCH_WINDOW` と同値にして受理範囲を揃える。
const SCAN_LIMIT: usize = 1024;
/// コメント行の開始バイト `%`。
const PERCENT: u8 = b'%';
/// オフセット値の基数（10 進）。
const DECIMAL_RADIX: u64 = 10;
/// ASCII 数字の基点バイト `'0'`。
const ASCII_ZERO: u8 = b'0';

/// 解析済みの `startxref` 情報。
///
/// 最後の `%%EOF` に対応する xref テーブルのバイトオフセットを保持する。値ラッパであり `Copy`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct StartXref {
    offset: ByteOffset,
}

impl StartXref {
    /// 入力バイト列の末尾 `SCAN_LIMIT` バイト以内から `startxref` のオフセット値を解析する。
    ///
    /// 返すオフセットは `startxref` に記録された値そのもの。ヘッダがファイル先頭に
    /// 無い PDF での原点補正（`PdfHeader::resolve_offset`）は呼び出し側の責務とする。
    ///
    /// # Errors
    ///
    /// - `InvalidSyntax`: 走査範囲内に `%%EOF` が無い / その手前に `startxref` が無い /
    ///   オフセット値と `%%EOF` の間に空白・コメント以外のバイトが残っている /
    ///   オフセット値がファイル長以上
    /// - `InvalidNumber`: `startxref` の後に 10 進数字が 1 桁も無い / 数値が `u64` を溢れる
    pub fn parse(input: &[u8]) -> Result<Self, PdfError> {
        let scan_start = input.len().saturating_sub(SCAN_LIMIT);
        let eof_pos =
            find_last_marker(input, EOF_MARKER, scan_start, input.len()).ok_or_else(|| {
                PdfError::new(PdfErrorCode::InvalidSyntax).with_message(format!(
                    "%%EOF not found within the last {SCAN_LIMIT} bytes"
                ))
            })?;
        // 綴りは Keyword::StartXref が持つ。as_bytes() の戻り値は self に借用が紐づくため、
        // 値のほうを先に束縛してから 2 回呼ぶ。
        let startxref_keyword = Keyword::StartXref;
        let keyword_pos =
            find_last_marker(input, startxref_keyword.as_bytes(), scan_start, eof_pos).ok_or_else(
                || {
                    PdfError::new(PdfErrorCode::InvalidSyntax)
                        .with_position(ByteOffset::new(eof_pos as u64))
                        .with_message("startxref keyword not found before %%EOF")
                },
            )?;
        let value_start = keyword_pos.saturating_add(startxref_keyword.as_bytes().len());
        let offset = parse_offset_value(input, value_start, eof_pos)?;
        Ok(Self { offset })
    }

    /// xref テーブルの開始バイトオフセットを返す。
    ///
    /// `startxref` に記録された生の値であり、ヘッダ原点による補正は含まない。
    pub fn offset(&self) -> ByteOffset {
        self.offset
    }
}

/// `scan_start..search_end` の範囲で `marker` の**最も後ろ**の出現位置を返す。
///
/// マーカー全体が範囲に収まっている必要がある。前後がトークン境界でない候補
/// （`x%%EOF` / `%%EOFx` など）と、コメント行の内側にある候補は読み飛ばす。
fn find_last_marker(
    input: &[u8],
    marker: &[u8],
    scan_start: usize,
    search_end: usize,
) -> Option<usize> {
    let mut pos = search_end.checked_sub(marker.len())?;
    loop {
        if pos < scan_start {
            return None;
        }
        let is_match = input.get(pos..)?.starts_with(marker)
            && has_token_boundary(input, pos, marker.len())
            && !is_inside_comment(input, pos);
        if is_match {
            return Some(pos);
        }
        pos = pos.checked_sub(1)?;
    }
}

/// `pos` から `len` バイトのトークンが、前後をトークン境界で挟まれているかを返す。
///
/// 入力の先頭・末尾に接している側は境界とみなす。
fn has_token_boundary(input: &[u8], pos: usize, len: usize) -> bool {
    let before_is_boundary = match pos.checked_sub(1) {
        Some(before) => input
            .get(before)
            .copied()
            .is_some_and(ByteKind::is_token_boundary),
        None => true,
    };
    if !before_is_boundary {
        return false;
    }
    let after = pos.saturating_add(len);
    input
        .get(after)
        .copied()
        .is_none_or(ByteKind::is_token_boundary)
}

/// `pos` が PDF コメント（`%` から行末まで）の内側にあるかを返す。
///
/// 行頭方向へ 1 バイトずつ遡り、EOL より先に `%` が現れればコメント内と判定する。
/// `%%EOF` 自身の先頭 `%` は判定対象に含めない（`pos` の 1 つ手前から見る）ため、
/// 正当な `%%EOF` を誤って除外することはない。
fn is_inside_comment(input: &[u8], pos: usize) -> bool {
    let mut cursor = pos;
    while let Some(prev) = cursor.checked_sub(1) {
        if EolKind::at(input, prev).is_some() {
            return false;
        }
        if input.get(prev).copied() == Some(PERCENT) {
            return true;
        }
        cursor = prev;
    }
    false
}

/// `start`（`startxref` の直後）から `end`（`%%EOF` の位置）までを読み、オフセット値を返す。
///
/// 数字列の前後に空白とコメントを許容し、それ以外のバイトが残っていればエラーにする。
fn parse_offset_value(input: &[u8], start: usize, end: usize) -> Result<ByteOffset, PdfError> {
    let position = ByteOffset::new(start as u64);
    let digits_start = skip_whitespace_and_comments(input, start, end);
    let mut cursor = digits_start;
    let mut value: u64 = 0;
    while cursor < end {
        let Some(&byte) = input.get(cursor) else {
            break;
        };
        if !byte.is_ascii_digit() {
            break;
        }
        value = value
            .checked_mul(DECIMAL_RADIX)
            .and_then(|shifted| shifted.checked_add(u64::from(byte - ASCII_ZERO)))
            .ok_or_else(|| {
                PdfError::new(PdfErrorCode::InvalidNumber)
                    .with_position(position)
                    .with_message("startxref offset overflows u64")
            })?;
        cursor = cursor.saturating_add(1);
    }
    if cursor == digits_start {
        return Err(PdfError::new(PdfErrorCode::InvalidNumber)
            .with_position(position)
            .with_message("startxref is not followed by a decimal offset"));
    }
    if skip_whitespace_and_comments(input, cursor, end) != end {
        return Err(PdfError::new(PdfErrorCode::InvalidSyntax)
            .with_position(ByteOffset::new(cursor as u64))
            .with_message("unexpected bytes between the startxref offset and %%EOF"));
    }
    if value >= input.len() as u64 {
        return Err(PdfError::new(PdfErrorCode::InvalidSyntax)
            .with_position(position)
            .with_message(format!(
                "startxref offset {value} is outside the file of {} bytes",
                input.len()
            )));
    }
    Ok(ByteOffset::new(value))
}

#[cfg(test)]
mod tests;
