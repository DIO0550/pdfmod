# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

**pdfmod** — React向けPDF編集ライブラリ。ISO 32000-1:2008 (PDF 1.7) および ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

**現在の状態:** 初期実装フェーズ。pnpmモノレポ構成で `@pdfmod/core`（PDF処理エンジン）と `@pdfmod/react`（Reactコンポーネント）の2パッケージ。Lexer/Tokenizerの初期実装済み。

## 開発環境

- **コンテナ:** Ubuntu 24.04（devcontainer経由、`.devcontainer/`）
- **ランタイム:** Node.js 24.x
- **パッケージマネージャ:** pnpm
- **開発サーバーポート:** 13200
- **フォーマッター:** Prettier（保存時自動フォーマット）
- **リンター:** ESLint
- **E2Eテスト:** Playwright（ブラウザはコンテナにプリインストール済み）

## ビルド・テストコマンド

```bash
pnpm build        # core → react の順にViteライブラリモードでビルド + tsc型定義出力
pnpm test         # Vitest watchモード
pnpm test:run     # Vitest 単発実行
pnpm lint         # ESLint v9 flat config
pnpm typecheck    # tsc --noEmit（全パッケージ）
pnpm format       # Prettier フォーマット
pnpm format:check # Prettier チェックのみ
pnpm storybook    # Storybook開発サーバー（ポート13200）
```

## パッケージ構成

| パッケージ | パス | 説明 |
|-----------|------|------|
| `@pdfmod/core` | `packages/core/` | PDF処理エンジン（React非依存） |
| `@pdfmod/react` | `packages/react/` | Reactコンポーネント・フック（coreに依存） |

## アーキテクチャ（仕様書より）

`docs/specs/09_implementation_guide.md` で定義されたパイプラインアーキテクチャ:

```
Lexer/Tokenizer → Graph Resolver → DOM Traverser
     ↓                ↓               ↓
Stream Interpreter ← Font Subsystem ← Document Writer
```

- **Lexer/Tokenizer:** バイト列→型付きトークン変換。`<<` と `<hex>` の区別に2バイト先読み、間接参照（`N G R`）に3トークンバックトラッキング。
- **Graph Resolver:** xref解析（従来形式＋ストリーム形式）、LRUキャッシュ、遅延読込、循環参照検出。
- **DOM Traverser:** ページツリー走査。MediaBox・Resourcesの親Pages継承解決が必須。
- **Stream Interpreter:** コンテンツストリームのスタックベースRPN評価器（グラフィックス状態、パス、テキスト、色）。
- **Font Subsystem:** Type 1、TrueType、Type 0/CIDFont、CMap解析、ToUnicode抽出。
- **Document Writer:** オブジェクト直列化、xref生成、増分更新。

## PDF重要概念

- 座標原点は**左下**（1単位 = 1/72インチ）。
- ページ属性（MediaBox、Resources）は親Pagesノードからの**継承**を使用 — 親チェーンの走査が必要。
- コンテンツストリームは**逆ポーランド記法（RPN）** — ループ・条件分岐・変数なし。
- テキスト抽出には `/ToUnicode` CMAPが必要。なければ文字コードからUnicodeへの復元は不可能。
- 圧縮: `/FlateDecode`（zlib）が最も一般的。フィルタは配列でカスケード可能。

## 仕様書ドキュメント

`docs/specs/` に詳細仕様あり — 実装時に参照すること:

| ファイル | トピック |
|---------|---------|
| `00_overview.md` | 適合性レベル、解析フロー |
| `01_lexical_conventions.md` | 9つのプリミティブ型、トークン、間接オブジェクト |
| `02_file_structure.md` | ヘッダ、本体、xref、トレーラ; EOF起点の解析 |
| `03_document_architecture.md` | カタログ、ページツリー、属性継承 |
| `04_resources_graphics_state.md` | リソース辞書、CTM、グラフィックス状態スタック |
| `05_content_streams.md` | RPN演算子、パス、テキスト、色 |
| `06_font_architecture.md` | フォント種別、CMap、テキストレンダリングパイプライン |
| `07_compression_filters.md` | FlateDecode、フィルタカスケード |
| `08_incremental_update_linearization.md` | 追記型更新、線形化 |
| `09_implementation_guide.md` | アーキテクチャパイプライン、実装ノート |

`docs/PDFフォーマット仕様調査とライブラリ開発.md` は包括的な調査ドキュメント（日本語）。
