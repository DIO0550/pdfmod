//! 次のトークン 1 個を取り出す統合ディスパッチ (next_token) と、
//! 内部用 raw ディスパッチ (next_raw_token)、数値→キーワード合流ヘルパを提供する。

use super::byte_kind::ByteKind;
use super::outcome::LexOutcome;
use super::token::{Primitive, Token};
use super::Lexer;

impl<'a> Lexer<'a> {
    /// 次のトークン 1 個を取り出す統合ディスパッチ API（ISO 32000-1 §7.2 / §7.3 全体）。
    ///
    /// 処理順:
    /// 1. `skip_whitespace` で whitespace 6 種のみ消費（コメントは消費しない。`%PDF-1.7` /
    ///    `%%EOF` を parser が拾えるようにするため）
    /// 2. `peek()` で先頭バイトを取得（取れなければ入力末尾として [`LexOutcome::Eof`] を返す）
    /// 3. 先頭バイトに応じて以下にディスパッチ:
    ///    - `%`               → `skip_comment` の本文を `to_vec()` で `Token::Comment` に組み立て
    ///    - `[` / `]`         → `read_array_begin` / `read_array_end`
    ///    - `<`               → `read_dict_begin` を先に試行し、`None` なら `read_hex_string` にフォールバック
    ///    - `>`               → `read_dict_end`（`None` ならそのまま `None`）
    ///    - `(`               → `read_literal_string` の戻り値を `Primitive::LiteralString` で包む
    ///    - `/`               → `read_name` の戻り値を `Primitive::Name` で包む
    ///    - `+` / `-` / digit → `read_integer` → 失敗時 `read_real` → 失敗時 `read_keyword`
    ///    - `.`               → `read_real` → 失敗時 `read_keyword`（`.foo` のような `.` 始まりの regular byte 連結を `Token::Keyword` で吸収するため、`+/-` / digit と対称）
    ///    - その他 regular    → `read_keyword`
    ///    - 上記以外          → [`LexOutcome::Malformed`]（pos 不変）
    ///
    /// `<` 分岐の二段構えは安全である（`read_hex_string` が `<<` 入力では `None` + `pos` 不変を
    /// 返すことが既存テストで保証されているため）。`+ABC` のような `+` / `-` 始まりの連結は
    /// `read_integer` / `read_real` が失敗した時点で `read_keyword` に流れ、`Token::Keyword` として吸収される。
    ///
    /// EOF / malformed の区別は戻り値の型が表現する（呼び出し側が `is_eof()` を追い問い合わせる
    /// 必要はない）:
    /// - [`LexOutcome::Eof`]       → 真 EOF（入力末尾に到達）
    /// - [`LexOutcome::Malformed`] → malformed input（仕様外バイトが残存）
    ///   - 例: `>` 単独・`{` / `}` のような仕様外 delimiter・`< ` のような `<<` でも 16 進開始
    ///     でもない `<` パターン
    ///   - これらは本層では `pos` 不変のまま `Malformed` を返すだけで、エラー化しない
    ///     （panic 不在 / エラー型なしの契約）
    ///
    /// no-progress 検知の用途: 「同じ malformed input で `next_token` を再試行したときに
    /// 無限ループしないための検知」には `Malformed` が運ぶ `position` を使う。前回と同じ
    /// `position` が返ったなら進んでいないため、1 バイト強制スキップなどのヒューリスティックを
    /// 適用する。`position()` は peek 済みトークンの開始位置を返すため、この用途には使わない。
    ///
    /// panic 不在: 各ディスパッチ先（既存 `read_*` / 新規 6 メソッド）がすべて panic 不在
    /// 契約を満たすため、本 API も任意の入力・任意の pos で panic しない。
    ///
    /// 注意: `stream` キーワード直後の改行スキップと stream データ本体（`/Length` バイト分）の
    /// 読み出しは本 API のスコープ外。本層は `Token::StreamBegin` を返すまでが責務。
    ///
    /// 内部 lookahead バッファとの関係:
    /// 直前に `peek_token` / `peek_token_at` を呼んで内部バッファにトークンが保留されている場合、
    /// 本 API はバッファ先頭エントリの `Token` 部分を `pop_front` で返す。これにより
    /// 「peek した値は次回 `next_token` でも同じ値を返す」契約を満たし、peek 系 API と混在
    /// しても token が skip/reorder されない。バッファ空時は従来通り入力バイトから lex する。
    /// 入力バイトから直接 lex したい内部用途には [`Self::next_raw_token`]（`pub(super)` の内部用 API）を使う。
    ///
    /// **Comment 観測上の注意**: `peek_token` / `peek_token_at` は Comment 透過の契約のため、
    /// peek の過程で読み飛ばされた `Token::Comment` はバッファに保留されず破棄される。
    /// したがって peek 後に本 API を呼ぶと、peek が透過スキップした Comment はもはや観測
    /// できない（バッファに残るのは Comment 以外のトークンのみ）。Comment を含む全トークンを
    /// 順に観測したい場合は、本 API を peek 系と混在させず単独で呼び出すこと。
    pub fn next_token(&mut self) -> LexOutcome<Token> {
        if let Some((tok, _)) = self.buffer.pop_front() {
            return LexOutcome::Lexed(tok);
        }
        self.skip_whitespace();
        self.next_raw_token()
    }

    /// 内部 lookahead バッファを無視して入力バイトから直接 1 トークン読み出す low-level API。
    ///
    /// 公開 [`Self::next_token`] の本体実装。`Lexer::ensure_buffered` /
    /// `Lexer::next_non_comment_token` から「バッファに積むトークンの素材」として呼ばれる経路は
    /// こちらを使う必要がある（公開 `next_token` を呼ぶと先に buffer から pop されてしまい
    /// ensure_buffered のループ不変条件が壊れるため）。
    ///
    /// **呼び出し前提**: 本 API は冒頭で `skip_whitespace` を呼ばない low-level 設計。
    /// 必要なら呼び出し側で事前に `skip_whitespace` を実行すること（`next_token` 側と
    /// `Lexer::next_non_comment_token` の双方で実施済み）。これにより
    /// `next_non_comment_token` の `pos` 採取直前にだけ whitespace を消費する形になり、
    /// `next_raw_token` 内で再スキャンする冗長性が消える。
    pub(super) fn next_raw_token(&mut self) -> LexOutcome<Token> {
        let Some(b) = self.peek() else {
            // 先頭バイトが取れないのは入力末尾に到達した場合だけ。ここが唯一の真の EOF 判定。
            return LexOutcome::Eof;
        };

        // 内側の read_* は Option のまま。None は「この字句ではない」＝ or_else による
        // 次候補への切替であり malformed ではない。全候補が尽きた時点でのみ malformed に畳む。
        let lexed = match b {
            b'%' => self
                .skip_comment()
                .map(|body| Token::Comment(body.to_vec())),
            b'[' => self.read_array_begin(),
            b']' => self.read_array_end(),
            b'<' => self.read_dict_begin().or_else(|| {
                self.read_hex_string()
                    .map(|bytes| Token::Primitive(Primitive::HexString(bytes)))
            }),
            b'>' => self.read_dict_end(),
            b'(' => self
                .read_literal_string()
                .map(|bytes| Token::Primitive(Primitive::LiteralString(bytes))),
            b'/' => self
                .read_name()
                .map(|name| Token::Primitive(Primitive::Name(name))),
            b'+' | b'-' => self.dispatch_numeric_or_keyword(),
            b'.' => self
                .read_real()
                .map(|r| Token::Primitive(Primitive::Real(r)))
                .or_else(|| self.read_keyword()),
            b if b.is_ascii_digit() => self.dispatch_numeric_or_keyword(),
            b if ByteKind::is_regular(b) => self.read_keyword(),
            _ => None,
        };

        match lexed {
            Some(tok) => LexOutcome::Lexed(tok),
            // 各 read_* は失敗時に pos を巻き戻すため、この時点の self.pos は不正バイトの先頭。
            // cursor_position() と同じ値であり、従来 parser が使っていたエラー位置と一致する。
            None => LexOutcome::Malformed { position: self.pos },
        }
    }

    /// 先頭が `+` / `-` / digit のときに使う数値→キーワードへの 3 段フォールバック。
    ///
    /// `next_token` の `+` / `-` 分岐と digit 分岐は ISO 32000-1 §7.3.3 + §7.3.10 の同一
    /// ドメイン（Numeric Objects + Keyword への合流）であり、`read_integer` → `read_real`
    /// → `read_keyword` の優先順位も共通であるため、本ヘルパに集約してチェーンの重複を排除する。
    /// 失敗時は各 `read_*` が `pos` を巻き戻すため呼び出し側で巻き戻し管理は不要。
    fn dispatch_numeric_or_keyword(&mut self) -> Option<Token> {
        self.read_integer()
            .map(|i| Token::Primitive(Primitive::Integer(i)))
            .or_else(|| {
                self.read_real()
                    .map(|r| Token::Primitive(Primitive::Real(r)))
            })
            .or_else(|| self.read_keyword())
    }
}
