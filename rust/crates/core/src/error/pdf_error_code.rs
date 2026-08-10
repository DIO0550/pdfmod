//! PDF 解析で発生するエラーの種類を表す `PdfErrorCode` を定義するモジュール。
//!
//! レクサー・パーサ・xref・リゾルバの各段階で起こりうるエラーを分類する
//! タグ型。データを持たない unit variant のみで構成し、位置・メッセージ等の
//! 詳細情報は後続の `PdfError`(#260) 側が保持する。本タスクでは R0／R1
//! （レクサー・パーサ段階）の最小バリアント集合のみを定義する（Issue #259）。

use std::fmt;

/// PDF 解析エラーの分類タグ。
///
/// 各バリアントはエラーの「種類」のみを表し、付随情報は持たない（unit variant）。
/// 軽量な分類タグとして `Copy` 可能。等価判定（`PartialEq`/`Eq`）は同一バリアントか
/// 否かに従う。順序・ハッシュは用途上不要のため derive しない（Issue #259 指定。
/// 既存 newtype の `Hash`/`PartialOrd`/`Ord` を持たない点が意図的な差異）。
/// 将来のフェーズ（xref／リゾルバ）でバリアントを追加していく方針。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PdfErrorCode {
    /// 入力の途中で予期せず終端（EOF）に達した。
    UnexpectedEof,
    /// 文法上その位置に現れてはならないトークンを検出した。
    UnexpectedToken,
    /// 数値として解釈できない入力を検出した。
    InvalidNumber,
    /// PDF の構文規則に違反する入力を検出した。
    InvalidSyntax,
    /// ファイルヘッダ `%PDF-x.y` が期待どおりに見つからない。
    InvalidHeader,
    /// ヘッダの版表記が ISO 32000 の規定する版ではない。
    UnsupportedVersion,
}

/// バリアントごとに人間可読な英語短文を返す。文言は `std::io::ErrorKind` の
/// 慣習に倣い、小文字始まり・句点なし。`#[non_exhaustive]` を付けないため、
/// 将来バリアントを追加した際は `match` の非網羅性がコンパイル時エラーとなり、
/// Display 文言の追加漏れが自動検出される。Debug は導出のまま（バリアント
/// 識別子）で、開発者向けダンプ用途との役割分離を保つ。
impl fmt::Display for PdfErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let text = match self {
            PdfErrorCode::UnexpectedEof => "unexpected end of file",
            PdfErrorCode::UnexpectedToken => "unexpected token",
            PdfErrorCode::InvalidNumber => "invalid number",
            PdfErrorCode::InvalidSyntax => "invalid syntax",
            PdfErrorCode::InvalidHeader => "invalid header",
            PdfErrorCode::UnsupportedVersion => "unsupported version",
        };
        f.write_str(text)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn same_variants_are_equal() {
        // 同一バリアント同士は == で等価と判定される（PartialEq/Eq の確認）
        assert_eq!(PdfErrorCode::UnexpectedEof, PdfErrorCode::UnexpectedEof);
    }

    #[test]
    fn different_variants_are_not_equal() {
        // 異なるバリアントは != で非等価と判定される
        assert_ne!(PdfErrorCode::UnexpectedEof, PdfErrorCode::UnexpectedToken);
    }

    #[test]
    fn all_distinct_variants_are_mutually_not_equal() {
        // 4 バリアントを総当たりで比較し、同一インデックスのみ等価・他は非等価であることを確認する
        let variants = [
            PdfErrorCode::UnexpectedEof,
            PdfErrorCode::UnexpectedToken,
            PdfErrorCode::InvalidNumber,
            PdfErrorCode::InvalidSyntax,
        ];
        for (i, a) in variants.iter().enumerate() {
            for (j, b) in variants.iter().enumerate() {
                if i == j {
                    assert_eq!(a, b);
                } else {
                    assert_ne!(a, b);
                }
            }
        }
    }

    #[test]
    fn is_copy_so_original_stays_usable() {
        // Copy derive によりコピー後も元の値がムーブされず再使用できることを確認する
        let original = PdfErrorCode::InvalidSyntax;
        let copied = original;
        assert_eq!(original, PdfErrorCode::InvalidSyntax);
        assert_eq!(original, copied);
    }

    #[test]
    fn debug_format_contains_variant_name() {
        // Debug 出力が各バリアント名を含むことを確認する
        assert!(format!("{:?}", PdfErrorCode::UnexpectedEof).contains("UnexpectedEof"));
        assert!(format!("{:?}", PdfErrorCode::UnexpectedToken).contains("UnexpectedToken"));
        assert!(format!("{:?}", PdfErrorCode::InvalidNumber).contains("InvalidNumber"));
        assert!(format!("{:?}", PdfErrorCode::InvalidSyntax).contains("InvalidSyntax"));
    }

    #[test]
    fn display_unexpected_eof() {
        // UnexpectedEof の Display 出力が "unexpected end of file" になることを確認する
        assert_eq!(
            format!("{}", PdfErrorCode::UnexpectedEof),
            "unexpected end of file"
        );
    }

    #[test]
    fn display_unexpected_token() {
        // UnexpectedToken の Display 出力が "unexpected token" になることを確認する
        assert_eq!(
            format!("{}", PdfErrorCode::UnexpectedToken),
            "unexpected token"
        );
    }

    #[test]
    fn display_invalid_number() {
        // InvalidNumber の Display 出力が "invalid number" になることを確認する
        assert_eq!(format!("{}", PdfErrorCode::InvalidNumber), "invalid number");
    }

    #[test]
    fn display_invalid_syntax() {
        // InvalidSyntax の Display 出力が "invalid syntax" になることを確認する
        assert_eq!(format!("{}", PdfErrorCode::InvalidSyntax), "invalid syntax");
    }
}
