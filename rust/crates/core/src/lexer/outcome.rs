//! lexer のトークン取得境界が返す 3 状態を表す [`LexOutcome`] を提供する。
//!
//! 「トークンが取れなかった」を `None` 1 つで表すと、入力末尾に到達した（EOF）のか
//! 仕様外バイトが残っている（malformed）のかが呼び出し側で復元できない。本 enum は
//! この 2 つを別バリアントに分け、malformed が自分でエラー位置を運ぶことで、
//! 「`is_eof()` を追い問い合わせる」「エラー位置は `cursor_position()` を使う」という
//! 呼び出し側の暗黙の契約を型で不要にする（Issue #609）。
//!
//! `XRefEntry`（`crate::xref::entry`, Issue #583）と同じ方針 —
//! 「状態と有効フィールドの対応をコメントではなく型で保証する」— の lexer 版である。

/// lexer のトークン取得境界が返す 3 状態。
///
/// 型引数 `T` は成功時のペイロードで、API ごとに異なる:
///
/// | API | `T` |
/// |---|---|
/// | [`Lexer::next_token`](crate::lexer::Lexer::next_token) | `Token` |
/// | [`Lexer::take_token`](crate::lexer::Lexer::take_token) | `Token` |
/// | [`Lexer::take_token_with_pos`](crate::lexer::Lexer::take_token_with_pos) | `(Token, usize)` |
/// | [`Lexer::peek_token`](crate::lexer::Lexer::peek_token) | `&Token` |
/// | [`Lexer::peek_token_at`](crate::lexer::Lexer::peek_token_at) | `&Token` |
/// | [`Lexer::peek_token_with_pos`](crate::lexer::Lexer::peek_token_with_pos) | `(&Token, usize)` |
/// | `Lexer::ensure_buffered`（内部） | `()` |
///
/// 位置をバリアント側ではなく `T` 側に持たせているのは、位置を返さない API
/// （`take_token` / `peek_token` / `ensure_buffered`）を同じ型で表すため。
///
/// derive は `Debug, Clone, PartialEq` のみ。`Token` が `Primitive::Real(f64)` を含み
/// `Eq`/`Hash`/`Ord` を derive できないため、それに揃える。
/// バリアント間に意味のある全順序がないため `PartialOrd` も derive しない
/// （`XRefEntry` / `ByteKind` / `PdfObject` と同方針）。
#[must_use]
#[derive(Debug, Clone, PartialEq)]
pub enum LexOutcome<T> {
    /// トークンの字句化に成功した。
    Lexed(T),

    /// 入力が尽きた（EOF）。
    ///
    /// 位置は常に `input.len()` であり
    /// [`Lexer::cursor_position`](crate::lexer::Lexer::cursor_position) から自明に得られるため、
    /// バリアントには持たせない。
    Eof,

    /// 仕様外バイトが残っており字句化できなかった（malformed input）。
    ///
    /// 例: `>` 単独 / `{` `}` のような仕様外 delimiter / `<<` でも 16 進開始でもない `<`。
    Malformed {
        /// 不正バイトの先頭バイトオフセット。
        ///
        /// 各 `read_*` が失敗時に `pos` を巻き戻す契約により、この値は
        /// [`Lexer::cursor_position`](crate::lexer::Lexer::cursor_position)
        /// （内部 lookahead バッファを無視した生のカーソル位置）と一致する。
        /// [`Lexer::position`](crate::lexer::Lexer::position) は peek 済みトークンの
        /// 開始位置を返すため malformed バイト位置とは一致しない。
        position: usize,
    },
}

impl<T> LexOutcome<T> {
    /// 成功ペイロードだけを変換し、`Eof` / `Malformed` はそのまま透過させる。
    ///
    /// 例: `take_token` は `take_token_with_pos().map(|(tok, _)| tok)` で実装される。
    pub fn map<U, F: FnOnce(T) -> U>(self, f: F) -> LexOutcome<U> {
        match self {
            Self::Lexed(value) => LexOutcome::Lexed(f(value)),
            Self::Eof => LexOutcome::Eof,
            Self::Malformed { position } => LexOutcome::Malformed { position },
        }
    }
}

#[cfg(test)]
mod tests;
