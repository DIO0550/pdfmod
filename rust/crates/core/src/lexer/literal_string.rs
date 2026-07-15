//! PDF リテラル文字列 `( ... )` (ISO 32000-1 §7.3.4.2 / docs/specs/01_lexical_conventions.md §3.4)
//! の字句解析を提供する。
//!
//! 公開 API は `Lexer::read_literal_string` のみ（`decode_literal_string` への薄いラッパー）。
//! `decode_literal_string` はメインループ全体（走査・ネスト深度・エスケープ委譲・EOL 正規化）を
//! 担う純関数で、入力バッファと位置だけ受け取り (デコード済みバイト列, 閉じ `)` 直後の次位置) を返す。
//! `decode_escape` / `decode_octal` はその内部で使う純関数で、`(push バイト, 消費バイト数)` を返す
//! （いずれも Lexer の状態に依存しない単体テスト可能な計算ロジック）。

use super::eol::EolKind;
use super::Lexer;

// 8 進エスケープ `\ddd` の仕様定数（ISO 32000-1 §7.3.4.2）。
const MAX_OCTAL_DIGITS: usize = 3; // greedy 最大桁数
const OCTAL_RADIX: u16 = 8; // 8 進基数
const BYTE_MASK: u16 = 0xFF; // 下位 8 ビット採用マスク（`\777` = 511 のクランプ用）
const ESCAPE_PREFIX_BYTES: usize = 1; // `consumed` に含む `\` の 1 バイト

/// PDF リテラル文字列 `( ... )` (ISO 32000-1 §7.3.4.2) を `input` の `pos` 位置から
/// デコードする純関数。境界チェックは `slice::get` で行い、いかなる入力・いかなる `pos` でも
/// panic しない。本関数は `input` を借用するだけで、位置の反映は呼び出し側が行う。
///
/// # 受理する字句
/// - 空文字列 `()`
/// - バランスしたネスト `(a(b)c)` — 内側の `(` / `)` はバイトとして含める
/// - エスケープ 8 種 (`\n`/`\r`/`\t`/`\b`/`\f`/`\(`/`\)`/`\\`)
/// - 8 進エスケープ `\ddd` (greedy 最大 3 桁、`'0'..='7'`、0xFF 超は下位 8 ビット採用)
/// - 裸 EOL (LF/CR/CRLF) の LF 正規化
/// - 行末 `\` + EOL の行継続 (出力に何も追加しない)
/// - 未知エスケープ (`\x` 等) はバックスラッシュのみ捨てて次バイトを保持
/// - 任意のバイト (NUL/非UTF-8/高位) を無検証で忠実に保持
///
/// # 拒否する字句 (None)
/// - 空入力 / `pos` が範囲外 / `input[pos]` が `(` でない
/// - `input` の終端までに対応する閉じ `)` が出ない (未終端)
/// - `pos.checked_add` / `depth.checked_add` が overflow
/// - 内部不変条件破れ (depth ≤ 0 の状態で `)` を観測)
///
/// # 戻り値
/// - `Some((bytes, next))`: `bytes` はデコード済みバイト列、`next` は閉じ `)` **直後の次位置**。
///   `decode_escape` / `decode_octal` の第 2 戻り値（消費バイト数 consumed）とは意味が異なる
///   ことに注意（本関数は「入力上の絶対位置」、両関数は「相対的な消費量」を返す）。
/// - `None`: 失敗。本関数は状態を持たないため、呼び出し側が位置を進めなければ
///   「失敗時 pos 不変（完全巻き戻し）」の契約が自然に成立する。
pub(super) fn decode_literal_string(input: &[u8], pos: usize) -> Option<(Vec<u8>, usize)> {
    if input.get(pos) != Some(&b'(') {
        return None;
    }
    let mut pos = pos.checked_add(1)?;

    let mut bytes: Vec<u8> = Vec::new();
    // depth: 文字列内のネスト深度。'(' で +1、')' で -1、終了時 0（不変条件: ループ内で depth >= 1）。
    // '(' 側で depth.checked_add を使うのは i32::MAX overflow の panic 防御
    // （実用上 21 億ネスト = 入力 2GB+ で到達しないが、untrusted / fuzz 入力契約のため使用）。
    let mut depth: i32 = 1;

    #[allow(clippy::while_let_loop)]
    loop {
        let Some(&b) = input.get(pos) else {
            // EOF (未終端) — 純関数はローカル状態を捨てて None を返すだけ（巻き戻し不要）
            return None;
        };

        match b {
            // 開き括弧 '(' — depth +1、'(' を bytes に push
            // depth.checked_add は論理的不変条件の overflow 防御、pos.checked_add は usize overflow 防御
            b'(' => {
                depth = depth.checked_add(1)?;
                pos = pos.checked_add(1)?;
                bytes.push(b'(');
            }

            // 閉じ括弧 ')' — depth -1、depth == 0 なら終了、それ以外で push
            // 不変条件 depth >= 1 を明示ガードで守る（破れていれば None）。
            // 通過後は depth - 1 が underflow しないので checked_sub は不要。
            b')' => {
                if depth <= 0 {
                    return None;
                }
                let next = pos.checked_add(1)?;
                depth -= 1;
                pos = next;
                if depth == 0 {
                    return Some((bytes, pos));
                }
                bytes.push(b')');
            }

            // バックスラッシュ '\\' — decode_escape に委譲し、結果（push バイトと消費量）を反映する
            // consumed は「相対的な消費バイト数」（本関数の戻り値 next = 絶対位置とは意味が異なる）
            b'\\' => {
                let (push_byte, consumed) = decode_escape(input, pos)?;
                pos = pos.checked_add(consumed)?;
                if let Some(d) = push_byte {
                    bytes.push(d);
                }
            }

            // 裸 EOL の LF 正規化（CR/CRLF → LF, LF → LF）/ その他バイトはそのまま保持
            _ => match EolKind::at(input, pos) {
                Some(eol) => {
                    pos = pos.checked_add(eol.byte_len())?;
                    bytes.push(0x0A);
                }
                None => {
                    pos = pos.checked_add(1)?;
                    bytes.push(b);
                }
            },
        }
    }
}

/// `\\` 起点のエスケープシーケンスをデコードする純関数。
/// `input[pos] == b'\\'` を想定。
///
/// # 戻り値
/// - `Some((Some(byte), consumed))`: `bytes` に `byte` を push し、`pos` を `consumed` バイト前進
/// - `Some((None, consumed))`: 何も push せず、`pos` を `consumed` バイト前進（行継続 / `\\` 直後 EOF）
/// - `None`: `pos.checked_add` overflow など（呼び出し側で巻き戻し）
///
/// `consumed` は `\\` を含む（簡易 8 種 = 2、行継続 = 1 + eol.byte_len()、`\\` 直後 EOF = 1、8 進 = 1 + digits）。
pub(super) fn decode_escape(input: &[u8], pos: usize) -> Option<(Option<u8>, usize)> {
    let next_pos = pos.checked_add(1)?;

    // 行継続 `\\ + EOL` — 出力なし、EOL 込みで前進
    // (peek_at(1) 判定より EolKind::at を先に評価する: CRLF を 1 個の EOL として扱うため)
    if let Some(eol) = EolKind::at(input, next_pos) {
        let consumed = 1usize.checked_add(eol.byte_len())?;
        return Some((None, consumed));
    }

    match input.get(next_pos) {
        // 簡易エスケープ 8 種 — 2 バイト消費、decoded を Some(byte) で返却
        Some(b'n') => Some((Some(0x0A), 2)),
        Some(b'r') => Some((Some(0x0D), 2)),
        Some(b't') => Some((Some(0x09), 2)),
        Some(b'b') => Some((Some(0x08), 2)),
        Some(b'f') => Some((Some(0x0C), 2)),
        Some(b'(') => Some((Some(b'('), 2)),
        Some(b')') => Some((Some(b')'), 2)),
        Some(b'\\') => Some((Some(b'\\'), 2)),

        // 8 進エスケープ \\ddd — greedy 1〜3 桁、(acc & 0xFF) as u8 を返却
        Some(&d) if (b'0'..=b'7').contains(&d) => decode_octal(input, next_pos),

        // \\ 直後 EOF — \\ だけ消費、出力なし。Lexer 側で pos 前進後、次反復で本体が EOF 検出して巻き戻す
        None => Some((None, 1)),

        // 未知エスケープ — バックスラッシュ捨て、次バイトを 1 文字として保持 (ISO 32000-1 §7.3.4.2)
        Some(&other) => Some((Some(other), 2)),
    }
}

/// 8 進エスケープ `\\ddd` の数字部分をデコードする内部ヘルパ（純関数）。
///
/// # 契約
///
/// 呼び出し側は次を保証する（本関数はいずれも検出しない）:
///
/// - `digits_start ≦ input.len()`（範囲内アクセスの前提）
/// - `digits_start + MAX_OCTAL_DIGITS ≦ usize::MAX`
///   （内部の unchecked 加算 `digits_start + digits` /
///   `ESCAPE_PREFIX_BYTES + digits` が overflow しない前提）
///
/// 現状の唯一の呼び出し元 `decode_escape` は `pos.checked_add(1)?` と
/// `input.get(next_pos).is_some()` を通過した位置のみを渡すため、両者は
/// 呼び出し元側で担保されている（`[u8]` スライスの標準的な長さ制約により
/// `input.len()` は `usize::MAX - MAX_OCTAL_DIGITS` を大きく下回る）。
/// この契約下で、ループ不変条件 `digits < MAX_OCTAL_DIGITS` と合わせて
/// 内部加算は overflow しない。
///
/// **本関数は契約違反を検出しない**。契約が破られた場合、
/// `digits_start + digits` は debug build で integer overflow panic を起こし、
/// release build では two's complement wrap により不正確な位置を参照して
/// 誤ったバイトを返す可能性がある。
///
/// # 戻り値
/// - `consumed` は `\\` の 1 バイトを含む（`ESCAPE_PREFIX_BYTES + digits`、最大 4）。
/// - 累積 `acc` は `u16` で最大 `\\777 = 511`、`(acc & BYTE_MASK) as u8` で下位 8 ビット採用。
/// - 外側 `Option<...>`: 本経路で `None` を返す分岐は存在しない
///   （`input.get` が `None` の場合は `break` して
///   `Some((Some((acc & BYTE_MASK) as u8), ESCAPE_PREFIX_BYTES + digits))` を返す）。
///   将来の EOL 分岐追加や別呼び出し元追加を想定した拡張余地として型上のみ保持している。
fn decode_octal(input: &[u8], digits_start: usize) -> Option<(Option<u8>, usize)> {
    // acc は u16 で累積（最大値 \\777 = 511 < u16::MAX）。最後に BYTE_MASK で下位 8 ビット採用。
    let mut acc: u16 = 0;
    let mut digits: usize = 0;
    while digits < MAX_OCTAL_DIGITS {
        let pos = digits_start + digits; // 契約 2: digits_start + MAX_OCTAL_DIGITS ≤ usize::MAX
        let Some(&b) = input.get(pos) else { break };
        if !(b'0'..=b'7').contains(&b) {
            break;
        }
        acc = acc * OCTAL_RADIX + (b - b'0') as u16;
        digits += 1;
    }
    let consumed = ESCAPE_PREFIX_BYTES + digits; // digits ≦ MAX_OCTAL_DIGITS により最大 4
    Some((Some((acc & BYTE_MASK) as u8), consumed))
}

impl<'a> Lexer<'a> {
    /// PDF リテラル文字列 `( ... )` (ISO 32000-1 §7.3.4.2) をデコード後のバイト列として読み取る。
    /// 計算は純関数 [`decode_literal_string`] に委譲し、本メソッドは結果の反映
    /// （`pos` 前進）のみを行う薄いラッパー。受理・拒否する字句の詳細は純関数側の doc を参照。
    ///
    /// # 契約
    /// - 成功時 `Some(Vec<u8>)`: `pos` は閉じ `)` の直後
    /// - 失敗時 `None`: `pos` は呼び出し前と等しい (完全巻き戻し)
    /// - 任意の入力・任意の `pos` で panic しない
    pub fn read_literal_string(&mut self) -> Option<Vec<u8>> {
        let (bytes, next) = decode_literal_string(self.input, self.pos)?;
        self.pos = next;
        Some(bytes)
    }
}

#[cfg(test)]
mod tests;
