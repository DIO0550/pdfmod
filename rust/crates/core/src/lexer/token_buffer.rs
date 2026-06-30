//! `Lexer` 内部の token 単位 lookahead バッファ管理。
//!
//! - `ensure_buffered`: 指定数のトークンがバッファに溜まるまで lex を進める（Comment 透過）
//! - `next_non_comment_token`: Comment を破棄しつつ 1 トークン取得
//!
//! 本モジュールは `lexer` の子モジュールとして `pub(super)` 公開。
//! 公開 peek/take API (`Lexer::peek_token` / `Lexer::take_token` 等) からのみ利用する。

use super::token::Token;
use super::Lexer;

/// `buffer.len() >= n` になるまで lex を進めてバッファを埋める。
///
/// Comment は透過スキップ（バッファに残さない）。EOF または malformed で `n` 個に届かない
/// 場合は `None`。呼び出し側 (peek_token / peek_token_at) は `None` を受けた後に
/// [`Lexer::is_eof`] で EOF と malformed を区別する責務を持つ。
/// 既に `buffer.len() >= n` なら何もせず `Some(())`。
pub(super) fn ensure_buffered(lexer: &mut Lexer<'_>, n: usize) -> Option<()> {
    while lexer.buffer.len() < n {
        let (tok, pos) = next_non_comment_token(lexer)?;
        lexer.buffer.push_back((tok, pos));
    }
    Some(())
}

/// 次の非 Comment トークンを `(Token, pos)` で取得する。
///
/// Comment は破棄して継続。EOF または malformed なら `None`。
/// `pos` は `skip_whitespace` 後の `lexer.pos` を採用する（トークン本体の開始位置）。
///
/// 公開 [`Lexer::next_token`] ではなく [`Lexer::next_raw_token`] を呼ぶことで、
/// バッファ内の peek 済みトークンを誤って pop しないようにする
/// （ensure_buffered のループ不変条件「`buffer.len() < n` の間ループ」を保つため）。
pub(super) fn next_non_comment_token(lexer: &mut Lexer<'_>) -> Option<(Token, usize)> {
    loop {
        lexer.skip_whitespace();
        let pos_before = lexer.pos;
        match lexer.next_raw_token()? {
            Token::Comment(_) => continue,
            tok => return Some((tok, pos_before)),
        }
    }
}
