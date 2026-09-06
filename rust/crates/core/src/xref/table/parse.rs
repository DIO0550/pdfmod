//! 従来型（テキストベース）xref テーブルの解析（ISO 32000-1:2008 §7.5.4、
//! `docs/specs/02_file_structure.md` §4.1）。
//!
//! `startxref` が指すオフセットから `xref` キーワード・サブセクションヘッダ・
//! エントリ行を読み、[`XRefTable`] を構築する。複数サブセクション（非連続な
//! オブジェクト番号範囲）に対応する。
//!
//! # 寛容度の方針
//!
//! 仕様はエントリを 20 バイト固定長（`nnnnnnnnnn ggggg s EOL`）と定めるが、
//! 実ファイルには EOL が 1 バイトの 19 バイトエントリが存在する。本モジュールは
//! **エントリを「整数 → 整数 → フラグ文字」の並びとしてトークン単位で読み**、
//! 桁数（10 桁 / 5 桁）を検証しない。区切りは空白スキップに任せるため、
//! 19 / 20 バイトの差も余分な空白も行末の種類（`LF` / `CR` / `CR LF` / `SP CR LF`）も
//! 区別なく吸収できる。
//!
//! # 検証しないこと
//!
//! 0 番の世代が 65535 か、0 番が free か、先頭サブセクションが 0 始まりか、
//! オフセットが指す位置が妥当かは**一切検証しない**。
//! [`XRefEntry`] / [`XRefTable`] の無検証方針を解析層でも踏襲し、
//! 妥当性判断は上位の解決層に委ねる。
//!
//! # オブジェクト番号 0 の扱い
//!
//! [`XRefTable`] のキーである [`ObjectNumber`] は ISO 32000-1 §7.3.10 の正整数しか
//! 表せないため、番号 0 のエントリは**エントリ本体を読み進めたうえで表に登録しない**（#334）。
//! エラーにはしない。標準的な PDF は `0 N` サブセクションを通じて必ず 0 番エントリを
//! 持つため、弾くと既存ファイルが軒並み読めなくなるからである。
//! スキップは戻り値に痕跡を残さない（本モジュールに警告チャネルが無いため）。
//!
//! この読み飛ばしにより §7.5.4 のフリーリストのヘッドが失われる。将来リストの走査を
//! 実装する際は、0 番エントリの保持方法を別途設計する必要がある。
//!
//! trailer 辞書の解析・xref ストリーム（#588）・`/Prev` を辿るチェーン走査は
//! 本モジュールの責務ではない。サブセクションを読み終えた位置は
//! [`ParsedXRefTable::end`] で返し、trailer 解析
//! （[`ParsedTrailer::parse`](crate::xref::trailer::parse::ParsedTrailer::parse)）に引き渡す。

use crate::byte_offset::ByteOffset;
use crate::lexer::byte_kind::ByteKind;
use crate::lexer::byte_ops::keyword_end_at;
use crate::lexer::skip::skip_whitespace_and_comments;
use crate::lexer::token::Keyword;
use crate::object::free_object_number::FreeObjectNumber;
use crate::object::generation_number::GenerationNumber;
use crate::object::object_number::ObjectNumber;
use crate::xref::entry::XRefEntry;
use crate::xref::error::XRefError;
use crate::xref::table::XRefTable;

/// 使用中（in-use）エントリの状態フラグ。
const FLAG_IN_USE: u8 = b'n';
/// 未使用（free）エントリの状態フラグ。
const FLAG_FREE: u8 = b'f';
/// 10 進の基数。
const DECIMAL_RADIX: u64 = 10;
/// ASCII の `0`。数字バイトから数値への変換に使う。
const ASCII_ZERO: u8 = b'0';

/// 従来型 xref テーブルの解析結果。
///
/// 構築した [`XRefTable`] と、サブセクションを読み終えて解析を打ち切った位置を持つ。
/// `end` は「最後のエントリの後、空白・コメントを読み飛ばした先」であり、
/// 通常は `trailer` キーワードの先頭を指す。
#[derive(Debug, Clone, PartialEq, Eq)]
#[must_use]
pub struct ParsedXRefTable {
    table: XRefTable,
    end: ByteOffset,
}

impl ParsedXRefTable {
    /// 従来型 xref テーブルを解析する。
    ///
    /// `start` は `xref` キーワードの位置（`startxref` が記録した値）。
    /// その位置から空白・コメントを読み飛ばした先に `xref` があることを確認し、
    /// サブセクションが尽きるまで「ヘッダ ＋ 件数ぶんのエントリ」を繰り返し読む。
    /// 数字で始まらないトークン（通常は `trailer`）に到達したら正常終了し、
    /// その位置を [`ParsedXRefTable::end`] として返す。
    ///
    /// # Errors
    ///
    /// - [`XRefErrorKind::MissingXRefKeyword`] — `start` が入力範囲外、または
    ///   空白を飛ばした先が `xref`（＋トークン境界）でない
    /// - [`XRefErrorKind::InvalidSubsectionHeader`] — サブセクションヘッダの
    ///   2 整数が読めない、または「先頭番号 + 件数」が `u64` を超える
    /// - [`XRefErrorKind::InvalidNumber`] — エントリのオフセット欄／世代番号欄が
    ///   10 進整数として読めない
    /// - [`XRefErrorKind::GenerationOutOfRange`] — 世代番号が 65535 を超える
    /// - [`XRefErrorKind::InvalidEntryFlag`] — 状態フラグが `n` / `f` 以外
    /// - [`XRefErrorKind::UnexpectedEof`] — 宣言件数を読み切る前に入力が尽きた
    ///
    /// [`XRefErrorKind::MissingXRefKeyword`]: crate::xref::error::XRefErrorKind::MissingXRefKeyword
    /// [`XRefErrorKind::InvalidSubsectionHeader`]: crate::xref::error::XRefErrorKind::InvalidSubsectionHeader
    /// [`XRefErrorKind::InvalidNumber`]: crate::xref::error::XRefErrorKind::InvalidNumber
    /// [`XRefErrorKind::GenerationOutOfRange`]: crate::xref::error::XRefErrorKind::GenerationOutOfRange
    /// [`XRefErrorKind::InvalidEntryFlag`]: crate::xref::error::XRefErrorKind::InvalidEntryFlag
    /// [`XRefErrorKind::UnexpectedEof`]: crate::xref::error::XRefErrorKind::UnexpectedEof
    pub fn parse(input: &[u8], start: ByteOffset) -> Result<Self, XRefError> {
        // ByteOffset(u64) → usize。入力範囲外なら、その位置に xref キーワードは無い。
        let Ok(begin) = usize::try_from(start.value()) else {
            return Err(XRefError::missing_xref_keyword_at(start));
        };
        if begin > input.len() {
            return Err(XRefError::missing_xref_keyword_at(start));
        }

        let mut cursor = expect_xref_keyword(input, begin)?;
        let mut table = XRefTable::new();

        loop {
            cursor = skip_blanks(input, cursor);
            // 数字で始まらなければサブセクションの終わり（通常は `trailer`）。
            // trailer かどうかの判定は後続の trailer パーサの責務なので、ここでは見ない。
            if !starts_with_digit(input, cursor) {
                break;
            }
            cursor = parse_subsection(input, cursor, &mut table)?;
        }

        Ok(Self {
            table,
            end: offset_of(cursor),
        })
    }

    /// 構築された xref テーブルへの参照を返す。
    #[must_use]
    pub fn table(&self) -> &XRefTable {
        &self.table
    }

    /// 構築された xref テーブルを取り出す（所有権を移す）。
    #[must_use]
    pub fn into_table(self) -> XRefTable {
        self.table
    }

    /// 解析を打ち切った位置を返す。後続の trailer 解析の開始位置になる。
    pub fn end(&self) -> ByteOffset {
        self.end
    }
}

/// 空白・コメントを飛ばした先に `xref` キーワードがあることを確認し、その直後の位置を返す。
///
/// キーワード直後はトークン境界（または EOF）でなければならない（`xrefs` を弾く）。
/// 綴りは [`Keyword::Xref`] から取る（バイト列リテラルの定義点は `Keyword::as_bytes` 1 箇所）。
fn expect_xref_keyword(input: &[u8], pos: usize) -> Result<usize, XRefError> {
    let keyword_start = skip_blanks(input, pos);

    keyword_end_at(input, keyword_start, Keyword::Xref.as_bytes())
        .ok_or_else(|| XRefError::missing_xref_keyword_at(offset_of(keyword_start)))
}

/// サブセクション 1 つ（ヘッダ ＋ 宣言件数ぶんのエントリ）を読み、読み終わり位置を返す。
///
/// `pos` はヘッダ先頭（最初の数字）を指していること。
fn parse_subsection(input: &[u8], pos: usize, table: &mut XRefTable) -> Result<usize, XRefError> {
    let (first_object, after_first) = read_unsigned(input, pos)
        .ok_or_else(|| XRefError::invalid_subsection_header_at(offset_of(pos)))?;

    let count_start = skip_blanks(input, after_first);
    let (count, after_count) = read_unsigned(input, count_start)
        .ok_or_else(|| XRefError::invalid_subsection_header_at(offset_of(count_start)))?;

    // 番号範囲が u64 に収まらないヘッダは表現できないため不正とみなす。
    // 検査対象は採番される最大値 `first_object + (count - 1)`。素直に見える
    // `checked_add(count)` は 1 件ぶん厳しく、`first_object = u64::MAX, count = 1`
    // のような表現可能なヘッダまで弾く（PR #602 のレビュー指摘）。
    // `count = 0` では saturating_sub が 0 を返し、first_object 自身の検査に落ちる。
    if first_object.checked_add(count.saturating_sub(1)).is_none() {
        return Err(XRefError::invalid_subsection_header_at(offset_of(pos)));
    }

    let mut cursor = after_count;
    for index in 0..count {
        let entry_start = skip_blanks(input, cursor);
        let (entry, after_entry) = read_entry(input, entry_start)?;
        // 上の checked_add により `first_object + (count - 1)` が u64 に収まることは
        // 確認済みで、`index` は `count - 1` 以下なのでこの加算は実際には溢れない。
        // それでも `+` ではなく saturating_add を使うのは、本クレートが
        // 「任意の入力で panic しない」ことを parser / lexer 各層の契約として持ち、
        // 上のガードが将来変わっても未検証入力でパースが panic に落ちないようにするため
        // （`large_first_object_number_does_not_overflow` がこの性質を固定している）。
        // オブジェクト番号 0 は §7.5.4 のフリーリスト先頭に予約された番号で、
        // 表のキーである `ObjectNumber`（§7.3.10 の正整数）では表現できない。
        // エントリ本体は読み進めたうえで登録だけを飛ばす（#334）。
        if let Some(number) = ObjectNumber::new(first_object.saturating_add(index)) {
            // 先勝ち。同一番号が既にあれば insert は false を返すが、ここでは結果を使わない。
            table.insert(number, entry);
        }
        cursor = after_entry;
    }

    Ok(cursor)
}

/// エントリ 1 件（整数 → 整数 → フラグ文字）を読み、エントリと読み終わり位置を返す。
///
/// 第 1 フィールドはフラグによって意味が変わる。`n` ならバイトオフセット、
/// `f` なら「次の空きオブジェクト番号」（`docs/specs/02_file_structure.md` §4.1）。
/// 行末（EOL）は消費しない。次のエントリを読む前の空白スキップが吸収する。
fn read_entry(input: &[u8], pos: usize) -> Result<(XRefEntry, usize), XRefError> {
    if pos >= input.len() {
        return Err(XRefError::unexpected_eof_at(offset_of(pos)));
    }

    let (first_field, after_first) =
        read_unsigned(input, pos).ok_or_else(|| XRefError::invalid_number_at(offset_of(pos)))?;

    let generation_start = skip_blanks(input, after_first);
    if generation_start >= input.len() {
        return Err(XRefError::unexpected_eof_at(offset_of(generation_start)));
    }
    let (generation_value, after_generation) = read_unsigned(input, generation_start)
        .ok_or_else(|| XRefError::invalid_number_at(offset_of(generation_start)))?;
    // GenerationNumber の内部型は u16。5 桁は最大 99999 なので範囲外がありうる。
    // 範囲判定は newtype のコンストラクタに委譲する（エラーには元の u64 を載せる）。
    let generation = GenerationNumber::try_from_u64(generation_value).ok_or_else(|| {
        XRefError::generation_out_of_range_at(offset_of(generation_start), generation_value)
    })?;

    let flag_pos = skip_blanks(input, after_generation);
    let Some(&flag) = input.get(flag_pos) else {
        return Err(XRefError::unexpected_eof_at(offset_of(flag_pos)));
    };

    let entry = match flag {
        FLAG_IN_USE => XRefEntry::InUse {
            offset: ByteOffset::new(first_field),
            generation,
        },
        FLAG_FREE => XRefEntry::Free {
            next_free_object: FreeObjectNumber::new(first_field),
            generation,
        },
        _ => return Err(XRefError::invalid_entry_flag_at(offset_of(flag_pos), flag)),
    };

    Ok((entry, flag_pos.saturating_add(1)))
}

/// `pos` から 10 進数字の並びを読み、値と読み終わり位置を返す。
///
/// 符号（`+` / `-`）は受理しない。以下は `None`:
///
/// - 数字が 1 桁も無い
/// - 値が `u64` を超える
/// - 数字列の直後が regular バイト（`17a` のように区切られていない）
fn read_unsigned(input: &[u8], pos: usize) -> Option<(u64, usize)> {
    let mut cursor = pos;
    let mut value: u64 = 0;

    while let Some(&byte) = input.get(cursor) {
        if !byte.is_ascii_digit() {
            break;
        }
        let digit = u64::from(byte.wrapping_sub(ASCII_ZERO));
        value = value.checked_mul(DECIMAL_RADIX)?.checked_add(digit)?;
        cursor = cursor.checked_add(1)?;
    }

    if cursor == pos {
        return None;
    }
    match input.get(cursor) {
        Some(&byte) if !ByteKind::is_token_boundary(byte) => None,
        _ => Some((value, cursor)),
    }
}

/// 空白・コメントを読み飛ばした位置を返す（既存 lexer の純粋関数に委譲）。
fn skip_blanks(input: &[u8], pos: usize) -> usize {
    skip_whitespace_and_comments(input, pos, input.len())
}

/// `pos` のバイトが 10 進数字かどうかを返す。入力末尾なら `false`。
fn starts_with_digit(input: &[u8], pos: usize) -> bool {
    input.get(pos).is_some_and(u8::is_ascii_digit)
}

/// 内部カーソル（`usize`）を公開 API の `ByteOffset` に変換する。
fn offset_of(pos: usize) -> ByteOffset {
    ByteOffset::new(pos as u64)
}

#[cfg(test)]
mod tests;
