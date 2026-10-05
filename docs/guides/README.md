# PDF仕様のHTML解説

PDF機能の実装に合わせて、仕様の読み方と実装の振る舞いを学べる解説を蓄積します。
仕様資料は [docs/specs](../specs/) を参照してください。

## 解説一覧

| テーマ | 解説する内容 | 関連する実装 |
| --- | --- | --- |
| [ドキュメントカタログ](document-catalog.html) | Root・Catalog・Pagesの関係、必須キー、バージョンの優先関係、表示設定、未解釈エントリの保持、位置付きエラー | [Issue #635](https://github.com/DIO0550/pdfmod/issues/635) / [PR #736](https://github.com/DIO0550/pdfmod/pull/736) の作成時点（`6c654ce`） |
| [ページ矩形と境界ボックス](page-boxes.html) | 対角の正規化、5種のボックスの既定値、MediaBoxとの交差、不正入力と未解決参照の扱い | [Issue #636](https://github.com/DIO0550/pdfmod/issues/636) 実装版 |
| [テキスト文字列](text-strings.html) | PDFDocEncoding・UTF-16BE・UTF-8、BOM判定、未割当バイト、サロゲート、不正入力の拒否／置換、バイト列との型境界 | [Issue #637](https://github.com/DIO0550/pdfmod/issues/637) / `rust/crates/core/src/text_string.rs` |

## 読み方

リポジトリを取得し、対象のHTMLファイルをブラウザで開いてください。GitHubのファイル画面ではHTMLのソースが表示されます。
各解説は単体で開け、本文・図・操作例はオフラインでも利用できます。

解説は仕様と仕組みの説明に集中し、出典・対象バージョンの節は設けません。実装との対応は上の一覧と関連PRで確認できます。

## 解説の作成・更新

[pdf-spec-guide スキル](../../.agents/skills/pdf-spec-guide/SKILL.md) に、作成手順・Web調査の制限（ユーザーの明示指示時のみ）・HTML/JavaScriptの安全確認・HTMLテンプレートをまとめています。
完成した解説はこのディレクトリへ置きます。同じテーマは既存解説を更新し、新しいテーマを追加したら上の一覧にも追記してください。

実行タイミングは [AGENTS.md](../../AGENTS.md#pdf仕様のhtml解説) を参照してください。
