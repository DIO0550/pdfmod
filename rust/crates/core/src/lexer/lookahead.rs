//! `Lexer` 内部の token 単位 lookahead バッファ管理と公開 peek/take API。
//!
//! - 公開: `peek_token` / `peek_token_at` / `take_token` / `peek_token_with_pos` / `take_token_with_pos`
//! - 内部: `ensure_buffered`（指定数のトークンがバッファに溜まるまで lex を進める。Comment 透過）/
//!   `next_non_comment_token`（Comment を破棄しつつ 1 トークン取得）
//!
//! 内部 API は `lexer` の子モジュールとして `pub(super)` 公開し、公開 peek/take API からのみ利用する。

use super::outcome::LexOutcome;
use super::token::Token;
use super::Lexer;

impl<'a> Lexer<'a> {
    /// 次に消費されるトークンを参照で覗き見る（Comment 透過込み）。
    ///
    /// peek した値は次回 `take_token`（および続く `peek_token`）でも同じ値を返す。
    /// `peek_token_at(0) == peek_token()`（0-indexed の最先頭）。
    pub fn peek_token(&mut self) -> LexOutcome<&Token> {
        self.peek_token_at(0)
    }

    /// 0-indexed で `n` 番目に取り出されるトークンを参照で覗き見る（Comment 透過込み）。
    ///
    /// `peek_token_at(0) == peek_token()`（0-indexed の最先頭）。
    /// peek したトークンは内部バッファに順序を保ったまま保留されるため、`take_token`
    /// を先頭から繰り返し呼ぶと同じ順序で取り出せる。具体的には `peek_token_at(n)` で
    /// 観測した値は、先頭から `n` 回 `take_token` を消費した次（つまり `n+1` 回目）の
    /// `take_token` で同じ値が返る。`n == 0` の場合のみ直後の `take_token` で同じ値が返る
    /// （`peek_token` と同義）。
    /// `n` が `usize::MAX` の場合は panic せず [`LexOutcome::Eof`] を返す
    /// （`n + 1` がオーバーフローするため）。「その位置にトークンは存在しない」という意味で
    /// `Eof` に寄せている。`usize::MAX` 個のトークンを持つ入力は存在せず、実際にバッファを
    /// 埋めていっても必ず EOF に到達するため。
    pub fn peek_token_at(&mut self, n: usize) -> LexOutcome<&Token> {
        let Some(required) = n.checked_add(1) else {
            return LexOutcome::Eof;
        };
        match self.ensure_buffered(required) {
            LexOutcome::Lexed(()) => {}
            LexOutcome::Eof => return LexOutcome::Eof,
            LexOutcome::Malformed { position } => return LexOutcome::Malformed { position },
        }
        match self.buffer.get(n) {
            Some((tok, _)) => LexOutcome::Lexed(tok),
            // ensure_buffered が Lexed を返した時点で buffer.len() >= n + 1 が保証されるため
            // 到達しない。panic 不在契約のため Eof に倒す。
            None => LexOutcome::Eof,
        }
    }

    /// 次のトークンをムーブで取り出す（Comment 透過込み）。
    ///
    /// 直前の `peek_token` / `peek_token_at(0)` で得た値（0-indexed の最先頭）と
    /// 同じトークンを返す。peek した値は次回 `take_token`（および続く `peek_token`）でも
    /// 同じ値を返す不変条件を保つ。
    /// バッファ非空ならフロントから、空時は内部で直接 lex を進める（`push_back` を経由しない）。
    /// 位置を捨てるだけの違いのため [`Self::take_token_with_pos`] に委譲する。
    pub fn take_token(&mut self) -> LexOutcome<Token> {
        self.take_token_with_pos().map(|(tok, _)| tok)
    }

    /// 次に消費されるトークンを位置情報付きで覗き見る（Comment 透過込み）。
    ///
    /// `peek_token_at(0) == peek_token()` と同じトークンを位置情報 (token 開始バイト位置)
    /// と共に返す。peek した値は次回 `take_token_with_pos`（および `peek_token`）でも
    /// 同じ値を返し、`pos` も `take_token_with_pos` が返す値と一致する。
    pub fn peek_token_with_pos(&mut self) -> LexOutcome<(&Token, usize)> {
        match self.ensure_buffered(1) {
            LexOutcome::Lexed(()) => {}
            LexOutcome::Eof => return LexOutcome::Eof,
            LexOutcome::Malformed { position } => return LexOutcome::Malformed { position },
        }
        match self.buffer.front() {
            Some((tok, pos)) => LexOutcome::Lexed((tok, *pos)),
            // ensure_buffered(1) が Lexed を返した時点で buffer は非空。到達しない。
            None => LexOutcome::Eof,
        }
    }

    /// 次のトークンを位置情報付きでムーブ取り出す（Comment 透過込み）。
    ///
    /// 直前の `peek_token` 系 / `peek_token_with_pos`（`peek_token_at(0) == peek_token()`
    /// と等価な 0-indexed 最先頭）で得た値があれば、それと同じトークンと `pos` を返す。
    /// peek した値は次回 `take_token_with_pos` でも同じ値を返す不変条件を保つ。
    /// バッファ非空ならフロントから、空時は内部で直接 lex を進める（`push_back` を経由しない）。
    pub fn take_token_with_pos(&mut self) -> LexOutcome<(Token, usize)> {
        if let Some(entry) = self.buffer.pop_front() {
            return LexOutcome::Lexed(entry);
        }
        self.next_non_comment_token()
    }

    /// `buffer.len() >= n` になるまで lex を進めてバッファを埋める。
    ///
    /// Comment は透過スキップ（バッファに残さない）。`n` 個に届かない場合は、その原因を
    /// [`LexOutcome::Eof`] / [`LexOutcome::Malformed`] として返す。
    /// 既に `buffer.len() >= n` なら何もせず `LexOutcome::Lexed(())`。
    pub(super) fn ensure_buffered(&mut self, n: usize) -> LexOutcome<()> {
        while self.buffer.len() < n {
            match self.next_non_comment_token() {
                LexOutcome::Lexed(entry) => self.buffer.push_back(entry),
                LexOutcome::Eof => return LexOutcome::Eof,
                LexOutcome::Malformed { position } => return LexOutcome::Malformed { position },
            }
        }
        LexOutcome::Lexed(())
    }

    /// 次の非 Comment トークンを `(Token, pos)` で取得する。
    ///
    /// Comment は破棄して継続。EOF または malformed なら
    /// [`LexOutcome::Eof`] / [`LexOutcome::Malformed`] をそのまま返す。
    /// `pos` は `skip_whitespace` 後の `self.pos` を採用する（トークン本体の開始位置）。
    ///
    /// 公開 [`Lexer::next_token`] ではなく [`Lexer::next_raw_token`] を呼ぶことで、
    /// バッファ内の peek 済みトークンを誤って pop しないようにする
    /// （ensure_buffered のループ不変条件「`buffer.len() < n` の間ループ」を保つため）。
    ///
    /// `skip_whitespace` は本関数内で 1 度だけ呼ぶ（`next_raw_token` 側は skip 不要前提）。
    /// これによりトークン取得ごとの whitespace スキャンが二重化されない。
    pub(super) fn next_non_comment_token(&mut self) -> LexOutcome<(Token, usize)> {
        loop {
            self.skip_whitespace();
            let pos_before = self.pos;
            match self.next_raw_token() {
                LexOutcome::Lexed(Token::Comment(_)) => continue,
                LexOutcome::Lexed(tok) => return LexOutcome::Lexed((tok, pos_before)),
                LexOutcome::Eof => return LexOutcome::Eof,
                LexOutcome::Malformed { position } => return LexOutcome::Malformed { position },
            }
        }
    }
}
