# AGENTS.md

**pdfmod** — React向けPDF編集ライブラリ。ISO 32000-1:2008 (PDF 1.7) / ISO 32000-2:2020 (PDF 2.0) 準拠を目標とする。

pnpm モノレポで `@pdfmod/core`（PDF処理エンジン）と `@pdfmod/react`（Reactコンポーネント）の2パッケージ。
`rust/crates/` に `std` のみの Rust 再実装（`pdfmod-core`）を持つ。仕様は `docs/specs/` を参照する。

## 規約（常時ロード）

実装は以下に**必ず**従う。`rust.md` 以外は `packages/` の TypeScript が対象。

- @rules/architecture.md — パッケージ構成・モジュールの公開API・ロジックの帰属先・依存方向
- @rules/coding.md — コンパニオンオブジェクト・Result / Option・型による境界・コメント
- @rules/naming.md — 命名
- @rules/testing.md — テスト配置・古典学派・assert の見方
- @rules/hooks.md — `@pdfmod/react` のフック設計
- @rules/components.md — `@pdfmod/react` のコンポーネント設計
- @rules/rust.md — Rust 実装（`rust/crates/`）

**規約に書いてあることをこのファイルへ写さない。** `AGENTS.md` + `rules/` は合計 800 行以内に保ち、
超えたら足す前に同量を削る（`wc -l AGENTS.md rules/*.md`）。

規約と衝突しうる変更（パッケージをまたぐ移動・既存モジュールの再配置）は、実装前に選択肢と根拠を示して確認する。

## PDF重要概念

- 座標原点は**左下**（1単位 = 1/72インチ）
- ページ属性（MediaBox、Resources）は親Pagesノードからの**継承** — 親チェーン走査が必要
- コンテンツストリームは**逆ポーランド記法（RPN）** — ループ・条件分岐・変数なし
- テキスト抽出には `/ToUnicode` CMAPが必須
- 圧縮: `/FlateDecode`（zlib）が最も一般的。フィルタは配列でカスケード可能

## 開発スキル

TypeScript を変更する作業では、以下を **Skill ツールで実行**する（memory があっても省略せず最新版を読み込む）。
**スキルと `rules/` が食い違ったら `rules/` を優先し、その食い違いを報告する。**

`implementation-workflow`（実装開始時）/ `coding-standards`（コーディング中）/ `tdd`・`testing`（テスト作成時）/
`typescript-code-review-skill`（レビュー時）/ `typescript-performance-review-skill`（パフォーマンス確認時）

## Commands

ルートで `pnpm run` — `typecheck` / `test:run` / `test:types` / `lint` / `lint:fix` / `build` / `storybook`。

`rust/` では以下。後ろ2つは CI と同じで、**警告は残さない**。

```bash
cargo test
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
```
