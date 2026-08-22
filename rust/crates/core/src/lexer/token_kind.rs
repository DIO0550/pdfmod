//! [`Token`](crate::lexer::token::Token) のバリアント種別を表す判別タグ。
//!
//! `ParseErrorKind::UnexpectedToken` に「実際に来たトークン」を載せるために使う。

use std::fmt;

/// `Token` のバリアント種別（データを持たない判別タグ）。
///
/// `Token::Primitive` の内側の [`Primitive`](crate::lexer::token::Primitive) 種別
/// （Integer / Real / Name 等）はここでは区別せず、まとめて [`Self::Primitive`] とする。
/// 文字列ラベルだった頃から変わらない契約で、呼び出し側（`take_object_number` 等）も
/// 「値域外の Integer」を Primitive として報告する前提でドキュメント化されている。
///
/// `#[non_exhaustive]` は付けない（`ObjectKind` と同方針）。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TokenKind {
    /// スカラ（null / boolean / 数値 / 文字列 / 名前）
    Primitive,
    /// `[`
    ArrayBegin,
    /// `]`
    ArrayEnd,
    /// `<<`
    DictBegin,
    /// `>>`
    DictEnd,
    /// `obj`
    ObjBegin,
    /// `endobj`
    ObjEnd,
    /// `stream`
    StreamBegin,
    /// `endstream`
    StreamEnd,
    /// 上記以外のキーワード（`R` / `true` 以外の裸トークン等）
    Keyword,
    /// `%` から行末までのコメント
    Comment,
}

impl TokenKind {
    /// 種別を表す短い `'static` 識別子を返す。文言は `Token` のバリアント名と一致させる。
    #[must_use]
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Primitive => "Primitive",
            Self::ArrayBegin => "ArrayBegin",
            Self::ArrayEnd => "ArrayEnd",
            Self::DictBegin => "DictBegin",
            Self::DictEnd => "DictEnd",
            Self::ObjBegin => "ObjBegin",
            Self::ObjEnd => "ObjEnd",
            Self::StreamBegin => "StreamBegin",
            Self::StreamEnd => "StreamEnd",
            Self::Keyword => "Keyword",
            Self::Comment => "Comment",
        }
    }
}

/// 種別名のみを出力する（`"ArrayBegin"`。装飾は付けない）。
impl fmt::Display for TokenKind {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        fmt::Display::fmt(self.as_str(), f)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 全 11 バリアントの as_str がバリアント名と同一の文字列を返すことを確認する
    #[test]
    fn as_str_returns_variant_name_for_every_variant() {
        let cases: [(TokenKind, &str); 11] = [
            (TokenKind::Primitive, "Primitive"),
            (TokenKind::ArrayBegin, "ArrayBegin"),
            (TokenKind::ArrayEnd, "ArrayEnd"),
            (TokenKind::DictBegin, "DictBegin"),
            (TokenKind::DictEnd, "DictEnd"),
            (TokenKind::ObjBegin, "ObjBegin"),
            (TokenKind::ObjEnd, "ObjEnd"),
            (TokenKind::StreamBegin, "StreamBegin"),
            (TokenKind::StreamEnd, "StreamEnd"),
            (TokenKind::Keyword, "Keyword"),
            (TokenKind::Comment, "Comment"),
        ];
        for (kind, expected) in cases {
            assert_eq!(kind.as_str(), expected, "kind: {kind:?}");
        }
    }

    // Display 出力が as_str と一致する（委譲されている）ことを確認する
    #[test]
    fn display_matches_as_str_for_every_variant() {
        let kinds = [
            TokenKind::Primitive,
            TokenKind::ArrayBegin,
            TokenKind::ArrayEnd,
            TokenKind::DictBegin,
            TokenKind::DictEnd,
            TokenKind::ObjBegin,
            TokenKind::ObjEnd,
            TokenKind::StreamBegin,
            TokenKind::StreamEnd,
            TokenKind::Keyword,
            TokenKind::Comment,
        ];
        for kind in kinds {
            assert_eq!(format!("{kind}"), kind.as_str(), "kind: {kind:?}");
        }
    }

    // 異なるバリアント同士が PartialEq で区別されることを確認する
    #[test]
    fn distinct_variants_are_not_equal() {
        assert_ne!(TokenKind::ArrayBegin, TokenKind::ArrayEnd);
    }
}
