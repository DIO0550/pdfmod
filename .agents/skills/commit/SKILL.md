---
name: commit
description: pdfmodでgit commitするときのメッセージ形式と分割の規則。絵文字+タグ形式に統一し、Conventional Commits（feat(core): など）は使わない。コミットを作る前に必ず読む。レビュー指摘を直すコミットは本文の意思決定記録を省いてよい。
---

# コミット規則

[d-market-git](https://github.com/DIO0550/d-market-git) の `git-workflow-plugin` の `commit` スキルと同じ形式を使う。
Claude Code ではプラグインの `/commit` がそのまま使える。このファイルは、プラグインを読めないエージェントと、pdfmod 固有の決まりのために置く。

## 1行目

```
<emoji> [<tag>]: #<Issue番号> <subject>
```

- **`feat(core):` のような Conventional Commits 形式は使わない。** 過去の履歴に混在しているが、今後は絵文字形式に統一する
- Issue があれば番号を書く（複数可）。無ければ省く
- subject は日本語で「何を・どうした」を書く。72字以内

| 用途 | 形式 | | 用途 | 形式 |
|:-|:-|:-|:-|:-|
| 新機能 | `✨ [New Feature]:` | | テスト | `🧪 [Tests]:` |
| バグ修正 | `🐛 [Bug Fix]:` | | パフォーマンス | `🚀 [Performance]:` |
| リファクタリング | `♻️ [Refactoring]:` | | 削除 | `🔥 [Remove]:` |
| ドキュメント | `📝 [Doc]:` | | 移動/リネーム | `🚚 [Move]:` |
| 設定ファイル | `🔧 [Config]:` | | CI/CD | `👷 [CI]:` |
| 雑務 | `🔨 [Chore]:` | | 型定義 | `🏷️ [Types]:` |
| Lint修正 | `🚨 [Lint]:` | | 破壊的変更 | `💥 [Breaking]:` |

表に無い種類は d-market-git の `plugins/git-workflow-plugin/skills/commit-template/references/default-template.yml` の `types` から選ぶ。`📖 [Doc]` `🐛 [Fix]` のような表に無い綴りを作らない。

## 本文

subject の後に空行を1行置き、次の順で書く。

1. 変更内容の要約を見出しなしの箇条書きで書く
2. `背景:` / `採用理由:` / `影響とトレードオフ:` の見出しで、diff から読み取れない「なぜ」を書く

```
✨ [New Feature]: #684 ネストした Form XObject を実行する

- Do で Form XObject を参照したとき、その内容ストリームを再帰的に実行する
- 実行中は Form の /Resources を優先して名前を解決する

背景:
Form XObject の中身が描画・テキスト抽出の対象から漏れていた。

採用理由:
リソースの探索範囲をスタックで持ち、Form を抜けたら元に戻す形にした。
ページの Resources を書き換える案は、同じ Form を複数回参照したとき壊れる。

影響とトレードオフ:
Form が自身を参照する PDF は循環として Result.err を返す。
```

- 見出しは `<見出し>:` を単独行に置く。**行頭 `#` は使わない**（git がコメント行として消す）
- 72桁前後で折り返す
- タイポ・フォーマッタの自動修正・生成物の更新は `採用理由:` だけ、または本文なしでよい
- 設計方針・公開APIの変更は `代替案:` と `参考:` も足す

### レビュー指摘を直すコミット

PRのレビュー指摘を直すコミットには、上の本文の規則（意思決定の記録）を適用しない。
1行目の形式は同じにし、本文は変更内容の箇条書きだけでよい。

## 分割

- 1コミット = 1つの最小単位の変更。大きいより小さいを優先する（目安 50 行以下）
- 次は必ず分ける: 複数機能 / バグ修正と新機能 / リファクタリングと機能追加 / ドキュメントと実装
- 各コミットで `pnpm run typecheck` と、Rust を触ったなら `cargo build` が通る状態にする

## 禁止

- `git add .` / `git add -A` / `git add --all`。ファイルを個別に指定する
- 「修正」「対応」「調整」「更新」「fix」「update」だけの subject
