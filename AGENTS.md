# AGENTS.md

## プロジェクト概要

**pdfmod** — React向けPDF編集ライブラリ。ISO 32000-1:2008 (PDF 1.7) および ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

pnpmモノレポ構成で `@pdfmod/core`（PDF処理エンジン）と `@pdfmod/react`（Reactコンポーネント）の2パッケージ。

## 仕様書

実装時は `docs/specs/` 配下の仕様書（`00_overview.md` 〜 `09_implementation_guide.md`）を参照すること。

`docs/PDFフォーマット仕様調査とライブラリ開発.md` は包括的な調査ドキュメント（日本語）。

## PDF重要概念

- 座標原点は**左下**（1単位 = 1/72インチ）
- ページ属性（MediaBox、Resources）は親Pagesノードからの**継承** — 親チェーン走査が必要
- コンテンツストリームは**逆ポーランド記法（RPN）** — ループ・条件分岐・変数なし
- テキスト抽出には `/ToUnicode` CMAPが必須
- 圧縮: `/FlateDecode`（zlib）が最も一般的。フィルタは配列でカスケード可能

## Result / Option の使い分け

- **`Result<T, E>`** — 値を生成するか、エラー情報付きで失敗する操作に使う
- **`Option<T>`** — 値の有無を表す。エラー情報は不要な場合（検索結果がない、パターン不一致など）
- **`null` は使わない** — `Option` で代替する（例: `tryReadIndirectRef` の「パターン不一致」は `None`）
- **`Result<void, E>` は避ける** — 成功時に値がない検証系は `Option<E>`（エラーがあれば `Some(error)`、なければ `None`）の方が自然（参照: #83）

## TypeScript 開発ルール

TypeScript コードを変更するすべての作業で以下のスキルを参照すること。

- 実装開始時は `implementation-workflow` スキルのフローに従う
- コーディング中は `coding-standards` スキルを参照
- テスト作成時は `tdd` および `testing` スキルを参照
- コードレビュー時は `typescript-code-review-skill` スキルを参照
- パフォーマンス確認時は `typescript-performance-review-skill` スキルを参照
