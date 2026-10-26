# PDF仕様のHTML解説

PDF機能の実装に合わせて、仕様の読み方と実装の振る舞いを学べる解説を蓄積します。
仕様資料は [docs/specs](../specs/) を参照してください。

## 解説一覧

| テーマ | 解説する内容 | 関連する実装 |
| --- | --- | --- |
| [文書からページへ](document-api.html) | PdfDocument / PdfPage の入口、ページの継承属性、単一・配列のContents、遅延解決の範囲、実ページ数・警告・エラー | [Issue #674](https://github.com/DIO0550/pdfmod/issues/674) / `rust/crates/core/src/document.rs` / `rust/crates/core/src/document/` |
| [ドキュメントカタログ](document-catalog.html) | Root・Catalog・Pagesの関係、必須キー、バージョンの優先関係、表示設定、未解釈エントリの保持、位置付きエラー | [Issue #635](https://github.com/DIO0550/pdfmod/issues/635) / [PR #736](https://github.com/DIO0550/pdfmod/pull/736) の作成時点（`6c654ce`） |
| [ドキュメント情報辞書](document-info.html) | Info参照、6つのテキスト項目・2つの日付・Trapped、項目ごとの成功／不在／失敗、未知キー保持、間接参照とNull | [Issue #661](https://github.com/DIO0550/pdfmod/issues/661) / `rust/crates/core/src/document_info.rs` / `rust/crates/core/src/resolver/document_info.rs` |
| [ページツリーと属性の継承](page-tree.html) | Kids の文書順走査、Count・Type の検証、循環と共有の区別、型付きページ位置、Parent チェーンによる4属性の継承、無効値の回復、間接座標参照、回転の正規化と既定値 | [Issue #658](https://github.com/DIO0550/pdfmod/issues/658) / [Issue #659](https://github.com/DIO0550/pdfmod/issues/659) / [Issue #660](https://github.com/DIO0550/pdfmod/issues/660) / `rust/crates/core/src/page_tree.rs` / `rust/crates/core/src/resolver/page_attributes.rs` |
| [リソース辞書と属性継承](resources.html) | /Resources 辞書構造、全置換原則による属性継承、空辞書フォールバック、2段階オンデマンド間接参照解決、非推奨 /ProcSet のスキップ、ストリーム透過返却 | [Issue #648](https://github.com/DIO0550/pdfmod/issues/648) / `packages/core/src/document/resources/` / `packages/core/src/document/page-tree/attr-resolver/` |
| [ページ矩形と境界ボックス](page-boxes.html) | 対角の正規化、5種のボックスの既定値、MediaBoxとの交差、不正入力と未解決参照の扱い | [Issue #636](https://github.com/DIO0550/pdfmod/issues/636) 実装版 |
| [テキスト文字列](text-strings.html) | PDFDocEncoding・UTF-16BE・UTF-8、BOM判定、未割当バイト、サロゲート、不正入力の拒否／置換、バイト列との型境界 | [Issue #637](https://github.com/DIO0550/pdfmod/issues/637) / `rust/crates/core/src/text_string.rs` |
| [日付文字列](date-format.html) | ISO 32000-1 / ISO 32000-2 構文、D: 接頭辞、階層的省略、タイムゾーン形式（' 区切り・Z）、うるう年・カレンダー厳格検証 | [Issue #638](https://github.com/DIO0550/pdfmod/issues/638) / `rust/crates/core/src/date.rs` |
| [字句トークンと描画命令の境界](token-layers.html) | 字句解析と演算子の再分類、LexicalTokenとContentStreamToken、巻き戻しと画像辞書の型境界、Operator.value、正常例・未知の命令・壊れた画像 | [Issue #308](https://github.com/DIO0550/pdfmod/issues/308) / `packages/core/src/pdf/types/token/index.ts` |

## 読み方

リポジトリを取得し、対象のHTMLファイルをブラウザで開いてください。GitHubのファイル画面ではHTMLのソースが表示されます。
各解説は単体で開け、本文・図・操作例はオフラインでも利用できます。

解説は仕様と仕組みの説明に集中し、出典・対象バージョンの節は設けません。実装との対応は上の一覧と関連PRで確認できます。

## 解説の作成・更新

[pdf-spec-guide スキル](../../.agents/skills/pdf-spec-guide/SKILL.md) に、作成手順・Web調査の制限（ユーザーの明示指示時のみ）・HTML/JavaScriptの安全確認・HTMLテンプレートをまとめています。
完成した解説はこのディレクトリへ置きます。同じテーマは既存解説を更新し、新しいテーマを追加したら上の一覧にも追記してください。

実行タイミングは [AGENTS.md](../../AGENTS.md#pdf仕様のhtml解説) を参照してください。
