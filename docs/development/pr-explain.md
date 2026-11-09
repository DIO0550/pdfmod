# PR の解説ページ

PR の差分を読む前に、変更の目的・構造・振る舞い・テスト・使われている技術を把握するためのページ。
seasoning-management-iOS の仕組みを移植し、pdfmod の TypeScript / React / Rust に合わせている。

## 自動で作るものと、実装担当が書くもの

| 入力 | 作成者 | 内容 |
| --- | --- | --- |
| `change-map.json` | `PR Explain` Actions | 変更ファイル、コミット差分、テスト宣言名の増減、解決できる依存 |
| `explain.json` | 実装担当のセッション | 目的、設計判断、前後の振る舞い、テストの意図、技術の解説 |
| `index.html` | 検証済み固定テンプレート | 2つのJSONを構造・経緯・テスト・振る舞い・技術の5画面へ表示 |

Actions は LLM を呼ばない。APIキーも不要。文章がない場合は未記入と表示し、差分から理由を推測しない。
文字サイズの調整、図の拡大・縮小、TypeScript / Rust のコード色分けを備える。
PDF仕様の恒久的な説明は従来どおり `docs/guides/` に置く。

## 初回設定

1. この仕組みのPRを `main` にマージする。
2. **Settings → Pages → Build and deployment** で、公開方法を選ぶ。
   - **GitHub Actions**: `PR Explain Deploy` が公開し、その job 内でコメントする。環境の許可ブランチは運用に合わせて `main` / `gh-pages` を設定する。
   - **Deploy from a branch** (`gh-pages` / root): 標準の `pages build and deployment` が公開し、成功後に `PR Explain Comment` がコメントする。独自deployは環境へ入る前にスキップする。
3. 導入後のPRを作成・push・reopenし、`PR Explain`、選択した公開CI、コメントの成功を確認する。

導入PR自体は、信頼するbaseにスクリプトがないため自動公開しない。すでに開いているPRは次のpushまたはreopenで対象となる。
`gh-pages` ブランチは、導入後のPRを初めて生成したときに作成する。導入PRのマージだけでは作成しない。
未作成の間はdeployをスキップし、Actions Summaryに初回生成の手順を表示する。Pagesの設定がない場合、ブランチへの配置だけ成功しても閲覧できない。
公開成功後、対象SHAが現在のPRと一致する場合にだけ、専用の固定コメントに閲覧URLと公開CIリンクが載る。

## 解説を書く

PR作成直後・振る舞いが変わるpushの後・reopen後に実施する。見本をリポジトリ外へコピーする。

```bash
cp .github/pr-explain/templates/explain.json /tmp/pdfmod-explain.json
git rev-parse HEAD
```

見本は書式の例であり、実際の変更を説明するものではない。`pr`、push済みの `sha`、パス、行番号、文章をすべて確認して置き換える。
不要な節は削除する。全スキーマの入力例は `harness/tests/fixtures/pr-explain.json` にあるが、これは移植元の回帰テスト用データ。
許容するキー・種類の正本は `.github/scripts/build-pr-explain.py` の `Shapes` / `Variants`。

| キー | 書く内容 |
| --- | --- |
| `overview` | 具体的な問題、変更前後の振る舞い、読む順序 |
| `concepts` / `messages` / `flows` | 各ファイルの責務、データの受け渡し、処理の順序 |
| `commitStories` | 各コミットの意図・理由と、処理ごとの変更内容を差分行へ結び付ける `notes` |
| `suites` / `tests` | 実際のテスト名、前提・操作・期待結果、境界値を選んだ理由 |
| `impact` | 利用者から見た変更前後、条件ごとの結果。実装の識別子は持ち込まない |
| `primers` | 言語機能 (`language`)、PDF の仕組み (`pdf`)、このコードベースの設計 (`codebase`) の説明 |
| `terms` | 本文の `[[表示名|id]]` から参照する用語の定義 |

技術の節は、用語の定義 → 何に困るか → 最小のコード → このPRでの使われ方 → 注意点の順で書く。
たとえば `Result`、enum、所有権、パーサの境界は、初めて読む人がコードを追えるところから説明する。
「型安全になった」だけで済ませず、扱える値・扱えない値と、呼び出し側のコードがどう変わるかを示す。
各技術の節には実コードの `excerpt` を1つ以上入れる。宣言やファイル名だけでは代用しない。
PDFの機能に関わるPRでは `kind: "pdf"` の節も書く。短いPDF記述を `declaration` に置き、
オペランド・辞書・参照の意味、適用されるスコープ、実装している範囲を説明する。
PDFの `declaration` は名前・数値・構文・命令・文字列・コメントを固定テンプレートで色分けする。
HTMLタグをJSONへ埋め込まず、生のPDF記述を `code` に書く。公開前に例の色分けと本文の保持を確認する。
仕様の節番号を `spec` に示し、pdfmod独自の回復動作は仕様の要件と区別する。
例: `/F1 12 Tf` → 現在の `/Resources` → `/Font` → フォント辞書。`seeAlso` で実装の節へつなぐ。

抜粋は `path` / `start` / `end` を指定する（1始まり、最大80行）。`text` は手で転記しない。
validator が指定SHAのGit objectから本文を読み、行番号と中身を固定する。
実行していないテストを合格と書かない。宣言名の一覧はテスト実行結果ではない。

### 「変更の経緯」の行注釈

コミットの要約や「ファイルを追加した」だけで終えず、各処理について **入力・変更内容・結果・理由** を説明する。
`commitStories` を各実装コミットに用意し、`notes` でそのコミット時点の差分行に結び付ける。
関数の追加、条件分岐、状態更新、呼び出し先への受け渡しは、それぞれの役割が読める単位に分ける。
新規ファイルも1件の大きな注釈で済ませず、処理ごとに書く。テストは前提と期待結果、文書や設定は変更の意味を書く。

```json
{
  "sha": "そのコミットの完全なSHA",
  "phase": "core",
  "role": "色空間の名前をリソース辞書から解決する",
  "why": "CS命令の名前から、後続の色指定に必要な成分数を得るため。",
  "notes": [
    {
      "path": "packages/core/src/content-stream/color-space-resources/index.ts",
      "side": "new",
      "start": 119,
      "end": 128,
      "text": "辞書に名前がない場合はCOLOR_SPACE_NOT_FOUNDを返す。定義がある未対応形式と区別し、呼び出し側が参照先の欠落を判断できるようにする。"
    }
  ]
}
```

この例のSHA・行は実際のコミットに置き換える。修正後のHEADの行番号を過去コミットへ流用しない。
`side` は変更後なら `new`（省略時も同じ）、削除箇所なら `old`。renameでも `path` は変更後のパスを使う。
1注釈は最大80行とし、変更された行を含める。別々に表示される差分へまたがる注釈は最初の差分にしか表示されないため、分けて書く。
バイナリ・内容不変のrename・地図が行差分を表示しない削除ファイルにも、変更の意味を記した注釈を用意する。
削除ファイルは変更前の存在する行へ `old` で付ける。バイナリ・内容不変のrenameはファイル単位の注釈として表示する。

ローカル生成と `put-explain` は `check-pr-story.py` で、実装コミット、変更ファイル、表示差分ごとの注釈の欠落、空白の本文、行範囲の誤りを拒否する。
本文の意味や、1つの差分内の複数処理を十分に説明したかは自動判定できない。公開前に全コミットを開き、各処理の説明とコードの対応を確認する。
2000行で省略された差分はGitHubでも確認し、表示範囲の注釈に省略部分の処理と参照先を補う。

## ローカルで検証する

```bash
python3 .github/scripts/build-pr-explain-local.py \
  --base origin/main --head HEAD --pr 123 \
  --head-branch feature/example --base-branch main \
  --explain /tmp/pdfmod-explain.json --out /tmp/pdfmod-pr-123
python3 -m http.server 8000 --directory /tmp/pdfmod-pr-123
```

`http://localhost:8000/#map` を開き、`#story` / `#test` / `#impact` / `#primer` も確認する。
`#story` では概要だけで済ませず、コミットを1つずつ選び、全変更ファイルの注釈と対応行の強調表示を確認する。
JSONの取得が必要なので `file://` では開かない。`--explain` を省くと地図のみを作り、以前の解説は出力先から消す。
検査に失敗した場合、既存の出力は更新しない。

## 公開する

PRの `PR Explain` が成功して地図が配置された後、検証した解説を公開する。

```bash
bash .github/scripts/pr-explain-pages.sh put-explain 123 /tmp/pdfmod-explain.json
```

`origin` にpushできる認証が必要。解説のSHAがリモート追跡ブランチにない場合は拒否するため、push・fetchを済ませる。
終了コード3は地図未配置または削除済み。PRが開いていて生成CIが成功しているか確認する。
`[pr-explain-story]` で拒否された場合は、表示されたコミット・パス・差分へ説明を補って再検証する。既存の公開物は更新されない。
解説と地図のSHAが異なる場合は古い解説として帯を表示する。変更後は最新SHAで書き直す。

GitHub Actions方式では、`gh-pages` へのpushで `PR Explain Deploy` が起動する。`GITHUB_TOKEN` のpushでは別のpush workflowが起動しないため、
自動生成側は `workflow_run` でもデプロイを起動する。手動公開で同じ制限のある認証を使う場合は、Actions画面からdeployを手動実行する。
ブランチ方式では標準の Pages 公開CIが成功した後にコメントする。公開CIの `head_sha` を読み、
まだ公開されていない最新ブランチを取り直さない。実行コードは既定ブランチから取得し、公開HTML/JSONはデータとして扱う。
新しい通知workflowは `main` にマージしてから有効になる。
公開CI成功とPRコメントのリンクを確認して完了とする。PRを閉じるとそのPRのフォルダを削除し、既存コメントも閉鎖表示へ更新する。

## 検査と制限

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s harness/tests -p 'test_pr*.py' -v
```

`PR Explain Check` で同じ検査を行う。実Git差分、改名、抜粋と参照の検証、CSP、5画面の描画ロジック、
ローカルbare remoteへの配置・削除・競合時の再試行、公開後コメントを検査する。Node.jsがなければ描画・コメント検査はskipする。
行注釈の検査は実Git差分で追加・削除・離れた変更箇所・古い解説を確認し、説明漏れが既存のローカル出力や公開物を上書きしないことも検査する。

- Vitestの静的な `test` / `it` の名前と、Rustの `#[test]` 関数（インラインを含む）、Pythonの `test_` 関数を拾う。
  テストの動的生成、別名import、マクロ展開、条件付きコンパイル、同名宣言の区別、実行件数や合否は判定しない。
- TypeScriptの相対importを一意に解決できた場合と、Python import・明示されたパスを依存として扱う。
  TypeScriptのaliasやRustの `use` の名前解決は行わない。不明な関係は確認して `messages` に書く。
- 同一リポジトリのPRだけを対象とし、forkとDependabotは公開しない。`pull_request_target` はbase SHAだけをcheckoutする。
  headはGit objectとして読むだけで、headのスクリプト・hook・アプリ・テストを実行しない。
- 公開器は対象PRの3ファイルだけを更新し、他のPR・既存コンテンツを保持する。デプロイはサイト全体で直列化する。
- JSONはデータとして描画し、固定テンプレートのスクリプト1本だけをCSPハッシュで許可する。外部JS・外部フォントは使わない。
  PDF仕様の静的HTMLに関する既存ルールとは別に、PRビューアとしてこの検証済みテンプレートを使う。

移植元: `DIO0550/seasoning-management-iOS`（取り込み時点 `f4a245b88278077d94412b3cf33c197111183f88`）。
元の `DIO0550/design-composer` 由来のMIT noticeは [pr-explain-LICENSE](../../harness/pr-explain-LICENSE) に保持する。
