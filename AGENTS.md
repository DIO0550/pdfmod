# AGENTS.md — 実装規約

## プロジェクト概要

**pdfmod** — React向けPDF編集ライブラリ。ISO 32000-1:2008 (PDF 1.7) および ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

pnpmモノレポ構成で `@pdfmod/core`（PDF処理エンジン）と `@pdfmod/react`（Reactコンポーネント）の2パッケージ。

- 言語: TypeScript (strict mode) / パッケージマネージャ: pnpm
- テスト: Vitest / UIカタログ: Storybook
- Lint / Format: oxlint / Biome
- 外部ランタイム依存: **原則禁止**（React の peer 依存と devDependencies を除く）

## 規約一覧（常時ロード）

このリポジトリで実装を行うAIエージェントは、以下の規約に**必ず**従うこと。

- @rules/architecture.md — パッケージ構成・モジュールの公開API・ロジックの帰属先・依存方向
- @rules/coding.md — コンパニオンオブジェクト・イミュータブル・Result / Option・型による境界・コメント・禁止事項
- @rules/naming.md — 命名（名前と実体の一致・汎用語の禁止・ファイル名）
- @rules/testing.md — テスト配置・古典学派・assert の見方・ネスト禁止
- @rules/hooks.md — `@pdfmod/react` のフック設計
- @rules/components.md — `@pdfmod/react` のコンポーネント設計

## 仕様書

実装時は `docs/specs/` 配下の仕様書（`00_overview.md` 〜 `09_implementation_guide.md`）を参照すること。

`docs/research/PDFフォーマット仕様調査とライブラリ開発.md` は包括的な調査ドキュメント（日本語）。

## PDF重要概念

- 座標原点は**左下**（1単位 = 1/72インチ）
- ページ属性（MediaBox、Resources）は親Pagesノードからの**継承** — 親チェーン走査が必要
- コンテンツストリームは**逆ポーランド記法（RPN）** — ループ・条件分岐・変数なし
- テキスト抽出には `/ToUnicode` CMAPが必須
- 圧縮: `/FlateDecode`（zlib）が最も一般的。フィルタは配列でカスケード可能

## 実装を始める前に

自己チェックの観点は `rules/` にある。**同じ内容をここに写さない**（2 箇所に置くと片方だけが古くなる）。実装前・PR 前に読む順は次の通り。

1. `rules/architecture.md`「ロジックの帰属先」「依存方向のルール」
2. `rules/coding.md`「エラーと不在の表現」「値の語彙を型で閉じる」「不正な状態を型で表現できなくする」「関数のシグネチャ」
3. `rules/naming.md`「名前と実体を一致させる」「その名前が既に別の意味を持っていないか確認する」

## 常時ロードには上限がある

**`AGENTS.md` + `rules/` の合計を 700 行以内に保つ。** これを超えたら、足す前に同量を削る。

- 数え方: `wc -l AGENTS.md rules/*.md`
- 閾値に達してから棚卸しするのではなく、**追加のたびに払う**。閾値方式は「超えるまで増え続ける」ことを許すので、超えた時点で必ず大きな棚卸しが要る
- `rules/` に置くのは**規範**（こうする）だけ。個別の実例・過去の指摘・このリポジトリ固有のシンボル名は置かない。判断軸は「**別のリポジトリへ持っていって意味が通るか**」

## 設計判断の確認

パッケージをまたぐ移動や既存モジュールの再配置など、**他の規約と衝突しうる変更**は、実装前に選択肢と根拠を示して確認する（勝手に進めず、判断だけを仰ぐ）。

## TypeScript 開発ルール

TypeScript コードを変更するすべての作業で、以下のスキルを **Skill ツールで実行**すること。
memory に過去の内容があっても省略せず、必ず Skill ツールで最新版を読み込むこと。
**スキルと `rules/` が食い違ったら `rules/` を優先し、その食い違いを報告すること。**

- 実装開始時は `implementation-workflow` スキルを Skill ツールで実行し、フローに従う
- コーディング中は `coding-standards` スキルを Skill ツールで実行
- テスト作成時は `tdd` および `testing` スキルを Skill ツールで実行
- コードレビュー時は `typescript-code-review-skill` スキルを Skill ツールで実行
- パフォーマンス確認時は `typescript-performance-review-skill` スキルを Skill ツールで実行

## Common Commands

リポジトリルートで実行する：

```bash
pnpm install              # 依存関係のインストール
pnpm run build            # 全パッケージのビルド
pnpm run typecheck        # TypeScript 型チェック
pnpm run test             # Vitest（watch モード）
pnpm run test:run         # Vitest 全テスト実行（CI 向け）
pnpm run test:types       # 型テスト（*.test-d.ts）の実行
pnpm run lint             # biome check + oxlint
pnpm run lint:fix         # 自動修正
pnpm run format           # biome format --write
pnpm run storybook        # Storybook 起動（ポート 13200）
```
