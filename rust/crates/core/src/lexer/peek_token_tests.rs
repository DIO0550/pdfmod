//! `Lexer` の token 単位 peek/take API のテスト群。
//!
//! 1 シナリオ 1 ファイル構成で、`peek_token` / `peek_token_at` / `take_token` /
//! `peek_token_with_pos` / `take_token_with_pos` / `cursor_position` の振る舞いを
//! 検証する。

use super::Lexer;

mod comment_transparent;
mod consecutive_peek_at;
mod eof_boundary;
mod malformed_vs_eof;
mod next_token_drains_buffer;
mod no_alloc_on_take_only;
mod peek_then_take_consistency;
mod position_after_peek;
mod skip_ws_and_comments_interaction;
mod usize_max_safe;

pub(super) fn lexer(input: &[u8]) -> Lexer<'_> {
    Lexer::new(input)
}
