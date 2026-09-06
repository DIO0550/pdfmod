//! PDF Name トークン (ISO 32000-1 §7.3.5) の字句解析。
//! `/` 直後から whitespace / delimiter / EOF までを Name 本体として読み、
//! `#XX` エスケープを 1 バイトに復号する。

use crate::object::name::PdfName;

use super::byte_kind::ByteKind;
use super::byte_ops::hex_value;
use super::Lexer;

/// 名前オブジェクトで禁止される NUL バイト（ISO 32000-2 §7.3.5）。
const NUL_BYTE: u8 = 0x00;
/// `#XX` エスケープが消費するバイト数（`#` + 16 進数字 2 桁）。
const HEX_ESCAPE_WIDTH: usize = 3;
/// 16 進数の基数。上位ニブルを 1 桁ずらすために使う。
const HEX_RADIX: u8 = 16;

/// `#XX` エスケープの後続 2 バイトを 1 バイトに復号する。
///
/// 両バイトが ASCII 16 進数字（`high` が上位ニブル、`low` が下位ニブル）で、
/// かつ復号結果が NUL でない場合のみ `Some` を返す。
/// EOF・非 16 進数字・`#00` はいずれも `None`（エスケープとして不正）。
fn decode_hex_escape(high: Option<u8>, low: Option<u8>) -> Option<u8> {
    let high_nibble = hex_value(high?)?;
    let low_nibble = hex_value(low?)?;
    let decoded = high_nibble * HEX_RADIX + low_nibble;
    (decoded != NUL_BYTE).then_some(decoded)
}

impl<'a> Lexer<'a> {
    /// ISO 32000-1 §7.3.5 に従う PDF Name トークンを読み取る。
    ///
    /// 受理する字句:
    /// - 先頭バイト `/` の直後から、次の whitespace / delimiter / EOF までを Name 本体として読む
    /// - 本体中の `#XX`（`#` + 2桁 ASCII 16進数字、大小混在可）を 1 バイトに復号する
    /// - エスケープとして不正な `#`（後続 2 バイトが EOF / whitespace / delimiter /
    ///   非 16 進 regular byte、または復号結果が NUL）は `#` をリテラル 1 バイトとして
    ///   本体に含め、次のバイトから読み取りを継続する
    /// - 復号後のバイト範囲 0x01〜0xFF を受理する（NUL は `#00` 経由では生成されない）
    /// - 空名前 `/`（`/` 直後に whitespace / delimiter / EOF が続く）は `Some(PdfName::new(b""))` で受理
    /// - 名前長は無制限（仕様の推奨上限は実装上強制しない）
    ///
    /// 拒否する字句（`None` 返却 + `pos` を呼び出し前位置に完全巻き戻し）:
    /// - 空入力 / EOF
    /// - 先頭バイトが `/` でない（pos 不変で None）
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

            if ByteKind::is_token_boundary(b) {
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

            // '#XX' エスケープ: 直後 2 バイトが両方 ASCII 16 進数字で、かつ復号結果が
            // NUL でない場合のみ 1 バイトに復号する。条件を満たさない場合は '#' を
            // リテラル文字として扱い、次のバイトから読み取りを継続する
            // （ISO 32000-1 §7.3.5 非適合入力の復旧。TypeScript 実装と同じ方針・#332）。
            let Some(decoded) = decode_hex_escape(self.peek_at(1), self.peek_at(2)) else {
                bytes.push(b'#');
                let Some(next) = self.pos.checked_add(1) else {
                    self.pos = start;
                    return None;
                };
                self.pos = next;
                continue;
            };

            bytes.push(decoded);
            let Some(next) = self.pos.checked_add(HEX_ESCAPE_WIDTH) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }

        Some(PdfName::new(bytes))
    }
}
