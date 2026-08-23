//! PDF キーワード (ISO 32000-1 §7.2 / §7.3.2 / §7.3.8-10) の字句解析。
//! 連続する regular バイト列を読み取り、既知 (true/false/null/obj/endobj/...) は
//! 専用バリアント、それ以外は Token::Keyword(Keyword) を返す。

use super::byte_kind::ByteKind;
use super::token::{Keyword, Primitive, Token};
use super::Lexer;

impl<'a> Lexer<'a> {
    /// 連続する regular バイト列を 1 つ読み取り、既知キーワードなら専用 `Token` バリアントに、
    /// それ以外なら `Token::Keyword(Keyword)` として返す（ISO 32000-1 §7.2 / §7.3.2 / §7.3.8 / §7.3.9 / §7.3.10）。
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
    /// - `R`         → `Token::Keyword(Keyword::R)`
    /// - `xref`      → `Token::Keyword(Keyword::Xref)`
    /// - `trailer`   → `Token::Keyword(Keyword::Trailer)`
    /// - `startxref` → `Token::Keyword(Keyword::StartXref)`
    /// - その他（`f` / `n` / `True` / `OBJ` / `trueX` 連結 / 未知バイト列）
    ///   → `Token::Keyword(Keyword::Unknown(<収集バイト列>))`
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
        let input = self.input;
        let start = self.pos;
        #[allow(clippy::while_let_loop)]
        loop {
            let Some(b) = self.peek() else { break };
            if ByteKind::is_token_boundary(b) {
                break;
            }
            let Some(next) = self.pos.checked_add(1) else {
                self.pos = start;
                return None;
            };
            self.pos = next;
        }
        // 収集した範囲は必ず入力の内側（start ≦ pos ≦ input.len()）だが、
        // panic 不在契約に従って `get` の Option で受ける。
        let bytes = input.get(start..self.pos)?;
        if bytes.is_empty() {
            // regular バイトを 1 つも収集していない。pos は start のままなので巻き戻し不要。
            return None;
        }
        match bytes {
            b"true" => Some(Token::Primitive(Primitive::Boolean(true))),
            b"false" => Some(Token::Primitive(Primitive::Boolean(false))),
            b"null" => Some(Token::Primitive(Primitive::Null)),
            b"obj" => Some(Token::ObjBegin),
            b"endobj" => Some(Token::ObjEnd),
            b"stream" => Some(Token::StreamBegin),
            b"endstream" => Some(Token::StreamEnd),
            _ => Some(Token::Keyword(Keyword::from_bytes(bytes))),
        }
    }
}
