//! PDF ファイルヘッダ `%PDF-x.y` の検出と、オフセット原点の確定を担うモジュール
//! （`docs/specs/02_file_structure.md` §2）。
//!
//! xref が記録するバイトオフセットは `%PDF-` の位置を原点とするため、版だけでなく
//! 原点そのものと、任意のバイナリファイルインジケータの有無を返す。

use crate::byte_offset::ByteOffset;
use crate::file::error::FileError;
use crate::file::version::PdfVersion;
use crate::lexer::byte_kind::ByteKind;
use crate::lexer::eol::EolKind;

/// ヘッダのシグネチャ。この直後に版表記が続く。
const SIGNATURE: &[u8] = b"%PDF-";
/// `%PDF-` を探す走査上限（ファイル先頭からのバイト数）。
///
/// PDF 仕様の規定ではなく、前置きバイトを許容する Adobe 実装ノート由来の慣行値。
/// TypeScript 実装の `HEADER_SCAN_LIMIT` と同値にして受理範囲を揃える。
const SCAN_LIMIT: usize = 1024;
/// 版表記として読み取る最大バイト数（`"1.7"` は 3 バイト。異常入力での暴走を防ぐ上限）。
const VERSION_MAX_LEN: usize = 8;
/// `%PDF-` を探す走査の開始位置（ファイル先頭）。
///
/// シグネチャ未検出エラーの報告位置に使う。
const SCAN_ORIGIN: u64 = 0;
/// バイナリファイルインジケータと判定する高ビットバイトの最小個数
/// （`docs/specs/02_file_structure.md` §2.3）。
const BINARY_INDICATOR_MIN_HIGH_BYTES: usize = 4;
/// 行末の判定に使う CR バイト。
const CR: u8 = 0x0D;
/// 行末の判定に使う LF バイト。
const LF: u8 = 0x0A;
/// コメント行の開始バイト `%`。
const PERCENT: u8 = b'%';

/// 解析済みの PDF ファイルヘッダ。
///
/// 版・オフセット原点・バイナリインジケータの有無を保持する。値ラッパであり `Copy`。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[must_use]
pub struct PdfHeader {
    version: PdfVersion,
    origin: ByteOffset,
    has_binary_indicator: bool,
}

impl PdfHeader {
    /// 入力バイト列の先頭 1024 バイト以内から PDF ヘッダを解析する。
    ///
    /// # Errors
    ///
    /// - [`FileErrorKind::SignatureNotFound`] — 走査範囲内に `%PDF-` が見つからない
    /// - [`FileErrorKind::UnexpectedEof`] — `%PDF-` の直後で版表記が読めない
    /// - [`FileErrorKind::UnsupportedVersion`] — 版表記が形式不正、または ISO 未規定
    ///
    /// [`FileErrorKind::SignatureNotFound`]: crate::file::error::FileErrorKind::SignatureNotFound
    /// [`FileErrorKind::UnexpectedEof`]: crate::file::error::FileErrorKind::UnexpectedEof
    /// [`FileErrorKind::UnsupportedVersion`]: crate::file::error::FileErrorKind::UnsupportedVersion
    pub fn parse(input: &[u8]) -> Result<Self, FileError> {
        let origin = find_signature(input)
            .ok_or_else(|| FileError::signature_not_found_at(ByteOffset::new(SCAN_ORIGIN)))?;
        let version_start = origin + SIGNATURE.len();
        let version_bytes = read_version_bytes(input, version_start);
        let position = ByteOffset::new(version_start as u64);
        if version_bytes.is_empty() {
            return Err(FileError::unexpected_eof_at(position));
        }
        let version = PdfVersion::from_bytes(version_bytes)
            .ok_or_else(|| FileError::unsupported_version_at(position, version_bytes.to_vec()))?;
        let after_version = version_start + version_bytes.len();
        Ok(Self {
            version,
            origin: ByteOffset::new(origin as u64),
            has_binary_indicator: has_binary_indicator(input, after_version),
        })
    }

    /// ヘッダが宣言する PDF バージョンを返す。
    ///
    /// カタログの `/Version` による上書き（§2.2）は適用していない暫定値。
    pub fn version(&self) -> PdfVersion {
        self.version
    }

    /// オフセット原点（`%PDF-` の開始位置）を返す。
    ///
    /// 通常の PDF では 0。前置きバイトがある PDF では正の値になる。
    pub fn origin(&self) -> ByteOffset {
        self.origin
    }

    /// ヘッダ直後にバイナリファイルインジケータ行があったかを返す。
    ///
    /// インジケータは任意要素であり、無くてもヘッダとしては正当（§2.3）。
    #[must_use]
    pub fn has_binary_indicator(&self) -> bool {
        self.has_binary_indicator
    }

    /// xref に記録されたオフセットを、ファイル先頭基準の実オフセットへ補正する。
    ///
    /// 記録値は `%PDF-` を原点とするため、原点を加算した位置が実際の読み取り位置になる。
    /// 加算が `u64` を超える場合（壊れた xref）は `None`。
    #[must_use]
    pub fn resolve_offset(&self, recorded: ByteOffset) -> Option<ByteOffset> {
        self.origin.checked_add(recorded)
    }
}

/// 先頭 `SCAN_LIMIT` バイト以内から `%PDF-` の開始位置を探す。
///
/// シグネチャ全体が走査範囲に収まっている必要がある（範囲を跨ぐ位置では検出しない）。
/// 入力が `SIGNATURE` より短い場合、`windows` は空イテレータとなり `None` を返す。
fn find_signature(input: &[u8]) -> Option<usize> {
    let limit = input.len().min(SCAN_LIMIT);
    input[..limit]
        .windows(SIGNATURE.len())
        .position(|window| window == SIGNATURE)
}

/// `start` から版表記のバイト列を切り出す。
///
/// ホワイトスペース（EOL を含む）で終端し、最大 `VERSION_MAX_LEN` バイトで打ち切る。
/// `start` が入力長を超える場合は空スライスを返す（呼び出し側が EOF として扱う）。
fn read_version_bytes(input: &[u8], start: usize) -> &[u8] {
    let end = input.len().min(start.saturating_add(VERSION_MAX_LEN));
    let Some(candidate) = input.get(start..end) else {
        return &[];
    };
    let len = candidate
        .iter()
        .position(|&byte| ByteKind::is_whitespace(byte))
        .unwrap_or(candidate.len());
    &candidate[..len]
}

/// `pos` 以降で最初の EOL を跨いだ、次の行の先頭位置を返す。
///
/// EOL の手前にホワイトスペース（スペース・タブなど）が挟まっていても跨ぐ。
/// EOL に達する前に非ホワイトスペースのバイトへ当たった場合、および入力が
/// 尽きた場合は `None`（＝次の行が無い）。位置の加算は `checked_add` で行い、
/// いかなる入力でも panic しない。
fn next_line_start(input: &[u8], pos: usize) -> Option<usize> {
    let mut cursor = pos;
    loop {
        if let Some(eol) = EolKind::at(input, cursor) {
            return cursor.checked_add(eol.byte_len());
        }
        if !ByteKind::is_whitespace(*input.get(cursor)?) {
            return None;
        }
        cursor = cursor.checked_add(1)?;
    }
}

/// 版表記の直後の行がバイナリファイルインジケータかどうかを判定する。
///
/// ヘッダ行の EOL（LF / CR / CRLF を 1 改行として）を 1 つ跨いだ次の行が `%` で始まり、
/// 行末までに高ビットバイト（0x80 以上 = 非 ASCII）を 4 個以上含めば真。
/// 次の行が無い・次行が `%` で始まらない場合は偽（エラーにはしない）。
/// 行を跨いで個数を合算はしない（インジケータは 1 行で完結する）。
fn has_binary_indicator(input: &[u8], after_version: usize) -> bool {
    let Some(line_start) = next_line_start(input, after_version) else {
        return false;
    };
    if input.get(line_start) != Some(&PERCENT) {
        return false;
    }
    let Some(body) = input.get(line_start.saturating_add(1)..) else {
        return false;
    };
    body.iter()
        .take_while(|&&byte| byte != CR && byte != LF)
        .filter(|&&byte| !byte.is_ascii())
        .count()
        >= BINARY_INDICATOR_MIN_HIGH_BYTES
}

#[cfg(test)]
mod tests;
