//! PDF Name トークン (ISO 32000-1 §7.3.5) の字句解析。
//! `/` 直後から whitespace / delimiter / EOF までを Name 本体として読み、
//! `#XX` エスケープを 1 バイトに復号する。

use crate::object::name::PdfName;

use super::byte_kind::ByteKind;
use super::byte_ops::hex_value;
use super::Lexer;

impl<'a> Lexer<'a> {
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
