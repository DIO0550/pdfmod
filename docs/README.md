# pdfmod ドキュメント案内

このディレクトリには、PDF 仕様のリファレンス、解析パイプラインの機能仕様、学習用の図解ガイド、設計メモをまとめています。

## 目的別の読み始めガイド

| やりたいこと | 最初に見る場所 |
| :--- | :--- |
| PDF の仕組みをざっくり掴みたい | [PDF 仕様入門 (`specs/pdf-primer.md`)](./specs/pdf-primer.md) |
| 図解と具体例で特定テーマを学びたい | [HTML 解説一覧 (`guides/README.md`)](./guides/README.md) |
| ISO 32000 の仕様や pdfmod の実装方針を調べたい | [PDF 仕様書 目次 (`specs/00_overview.md`)](./specs/00_overview.md) |
| `@pdfmod/core` 解析パイプラインのモジュール仕様・エラーコードを確認したい | [解析パイプライン仕様 (`pdf-parsing-pipeline/index.md`)](./pdf-parsing-pipeline/index.md) |
| React + TypeScript の編集アーキテクチャや Rust エラー設計を見たい | [design/](./design/) |
| PR の解説ページの作り方を確認したい | [PR 解説の作成手順 (`development/pr-explain.md`)](./development/pr-explain.md) |

## ディレクトリ構成

| ディレクトリ | 役割 | 主な読者・用途 |
| :--- | :--- | :--- |
| [specs/](./specs/00_overview.md) | **PDF 仕様書（00〜09章・02a・02b・入門）** | ISO 32000 の仕様と、各領域における pdfmod（TypeScript / Rust）の実装方針・回復方針を整理したリファレンス。ソースコードや `rules/` からの節番号参照（`§X.Y`）の基準点。 |
| [pdf-parsing-pipeline/](./pdf-parsing-pipeline/index.md) | **解析パイプライン機能仕様書** | `@pdfmod/core` の Phase 1〜2（xref 解析・オブジェクト解決・ページツリー・公開 API・エラー体系）のモジュール単位の仕様。エラー/警告コード一覧の正本を含む。 |
| [guides/](./guides/README.md) | **PDF 仕様の HTML 解説** | ブラウザで単体表示できる学習用ドキュメント。色分けされた PDF 実例・図解・操作例で仕様の読み方と実装の振る舞いを解説する。 |
| [design/](./design/) | **設計ドキュメント** | React エディタ設計ガイドや Rust `PdfError` の型別文脈など、横断的な設計方針の記録。 |
| [development/](./development/pr-explain.md) | **開発運用ガイド** | PR 解説ページ（`explain.json`）の作成・検証手順など、開発ワークフローの手引き。 |
| [research/](./research/PDFフォーマット仕様調査とライブラリ開発.md) | **初期調査レポート** | `specs/` 分割の元になった包括的な PDF フォーマット調査資料（アーカイブ）。 |

## `specs/` と `pdf-parsing-pipeline/` の使い分け

- **`specs/`**: 「PDF 規格（ISO 32000）ではどう決まっているか」を軸に、構文・ファイル構造・暗号化・ページツリー・リソース・コンテンツストリーム・フォント・圧縮・増分更新を章立てで解説し、必要な箇所に **pdfmod の実装方針** を併記する。
- **`pdf-parsing-pipeline/`**: 「`@pdfmod/core` の各モジュールが何を入力に受け取り、どのルール・エラーコードで処理するか」を、実装単位のルール ID（`XR-001` 等）と表で定義する。
