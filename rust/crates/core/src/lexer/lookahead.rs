//! `Lexer` 内部の token 単位 lookahead バッファ管理と公開 peek/take API。
//!
//! - 公開: `peek_token` / `peek_token_at` / `take_token` / `peek_token_with_pos` / `take_token_with_pos`
//! - 内部: `ensure_buffered`（指定数のトークンがバッファに溜まるまで lex を進める。Comment 透過）/
//!   `next_non_comment_token`（Comment を破棄しつつ 1 トークン取得）
//!
//! 内部 API は `lexer` の子モジュールとして `pub(super)` 公開し、公開 peek/take API からのみ利用する。

use super::token::Token;
use super::Lexer;

impl<'a> Lexer<'a> {
    /// 次に消費されるトークンを参照で覗き見る（Comment 透過込み）。
    ///
    /// peek した値は次回 `take_token`（および続く `peek_token`）でも同じ値を返す。
    /// `peek_token_at(0) == peek_token()`（0-indexed の最先頭）。
    pub fn peek_token(&mut self) -> Option<&Token> {
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
    /// `n` が `usize::MAX` でも panic せず `None` を返す（`n.checked_add(1)` で吸収）。
    pub fn peek_token_at(&mut self, n: usize) -> Option<&Token> {
        let required = n.checked_add(1)?;
        self.ensure_buffered(required)?;
        self.buffer.get(n).map(|(tok, _)| tok)
    }

    /// 次のトークンをムーブで取り出す（Comment 透過込み）。
    ///
    /// 直前の `peek_token` / `peek_token_at(0)` で得た値（0-indexed の最先頭）と
    /// 同じトークンを返す。peek した値は次回 `take_token`（および続く `peek_token`）でも
    /// 同じ値を返す不変条件を保つ。
    /// バッファ非空ならフロントから、空時は内部で直接 lex を進める（`push_back` を経由しない）。
    pub fn take_token(&mut self) -> Option<Token> {
        if let Some((tok, _)) = self.buffer.pop_front() {
            return Some(tok);
        }
        self.next_non_comment_token().map(|(tok, _)| tok)
    }

    /// 次に消費されるトークンを位置情報付きで覗き見る（Comment 透過込み）。
    ///
    /// `peek_token_at(0) == peek_token()` と同じトークンを位置情報 (token 開始バイト位置)
    /// と共に返す。peek した値は次回 `take_token_with_pos`（および `peek_token`）でも
    /// 同じ値を返し、`pos` も `take_token_with_pos` が返す値と一致する。
    pub fn peek_token_with_pos(&mut self) -> Option<(&Token, usize)> {
        self.ensure_buffered(1)?;
        self.buffer.front().map(|(tok, pos)| (tok, *pos))
    }

    /// 次のトークンを位置情報付きでムーブ取り出す（Comment 透過込み）。
    ///
    /// 直前の `peek_token` 系 / `peek_token_with_pos`（`peek_token_at(0) == peek_token()`
    /// と等価な 0-indexed 最先頭）で得た値があれば、それと同じトークンと `pos` を返す。
    /// peek した値は次回 `take_token_with_pos` でも同じ値を返す不変条件を保つ。
    /// バッファ非空ならフロントから、空時は内部で直接 lex を進める（`push_back` を経由しない）。
    pub fn take_token_with_pos(&mut self) -> Option<(Token, usize)> {
        if let Some(entry) = self.buffer.pop_front() {
            return Some(entry);
        }
        self.next_non_comment_token()
    }

    /// `buffer.len() >= n` になるまで lex を進めてバッファを埋める。
    ///
    /// Comment は透過スキップ（バッファに残さない）。EOF または malformed で `n` 個に届かない
    /// 場合は `None`。呼び出し側 (peek_token / peek_token_at) は `None` を受けた後に
    /// [`Lexer::is_eof`] で EOF と malformed を区別する責務を持つ。
    /// 既に `buffer.len() >= n` なら何もせず `Some(())`。
    pub(super) fn ensure_buffered(&mut self, n: usize) -> Option<()> {
        while self.buffer.len() < n {
            let (tok, pos) = self.next_non_comment_token()?;
            self.buffer.push_back((tok, pos));
        }
        Some(())
    }

    /// 次の非 Comment トークンを `(Token, pos)` で取得する。
    ///
    /// Comment は破棄して継続。EOF または malformed なら `None`。
    /// `pos` は `skip_whitespace` 後の `self.pos` を採用する（トークン本体の開始位置）。
    ///
    /// 公開 [`Lexer::next_token`] ではなく [`Lexer::next_raw_token`] を呼ぶことで、
    /// バッファ内の peek 済みトークンを誤って pop しないようにする
    /// （ensure_buffered のループ不変条件「`buffer.len() < n` の間ループ」を保つため）。
    ///
    /// `skip_whitespace` は本関数内で 1 度だけ呼ぶ（`next_raw_token` 側は skip 不要前提）。
    /// これによりトークン取得ごとの whitespace スキャンが二重化されない。
    pub(super) fn next_non_comment_token(&mut self) -> Option<(Token, usize)> {
        loop {
            self.skip_whitespace();
            let pos_before = self.pos;
            match self.next_raw_token()? {
                Token::Comment(_) => continue,
                tok => return Some((tok, pos_before)),
            }
        }
    }
}
