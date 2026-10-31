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
2. リポジトリの **Settings → Pages → Build and deployment → Source: GitHub Actions** を選ぶ。
3. `github-pages` environment にブランチ制限がある場合は、`main` と `gh-pages` からのデプロイを許可する。
4. 導入後のPRを作成・push・reopenし、`PR Explain` と `PR Explain Deploy` の成功を確認する。

導入PR自体は、信頼するbaseにスクリプトがないため自動公開しない。すでに開いているPRは次のpushまたはreopenで対象となる。
`gh-pages` ブランチは最初の公開時に作成する。Pagesの設定がない場合、ブランチへの配置だけ成功しても閲覧できない。
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
| `commitStories` | 各コミットの意図、変更が必要だった理由、レビュー箇所 |
| `suites` / `tests` | 実際のテスト名、前提・操作・期待結果、境界値を選んだ理由 |
| `impact` | 利用者から見た変更前後、条件ごとの結果。実装の識別子は持ち込まない |
| `primers` | 言語機能 (`language`) と、このコードベースの設計 (`codebase`) の説明 |
| `terms` | 本文の `[[表示名|id]]` から参照する用語の定義 |

技術の節は、用語の定義 → 何に困るか → 最小のコード → このPRでの使われ方 → 注意点の順で書く。
たとえば `Result`、enum、所有権、パーサの境界は、初めて読む人がコードを追えるところから説明する。
「型安全になった」だけで済ませず、扱える値・扱えない値と、呼び出し側のコードがどう変わるかを示す。
各技術の節には実コードの `excerpt` を1つ以上入れる。宣言やファイル名だけでは代用しない。

抜粋は `path` / `start` / `end` を指定する（1始まり、最大80行）。`text` は手で転記しない。
validator が指定SHAのGit objectから本文を読み、行番号と中身を固定する。
実行していないテストを合格と書かない。宣言名の一覧はテスト実行結果ではない。

## ローカルで検証する

```bash
python3 .github/scripts/build-pr-explain-local.py \
  --base origin/main --head HEAD --pr 123 \
  --head-branch feature/example --base-branch main \
  --explain /tmp/pdfmod-explain.json --out /tmp/pdfmod-pr-123
python3 -m http.server 8000 --directory /tmp/pdfmod-pr-123
```

`http://localhost:8000/#map` を開き、`#story` / `#test` / `#impact` / `#primer` も確認する。
JSONの取得が必要なので `file://` では開かない。`--explain` を省くと地図のみを作り、以前の解説は出力先から消す。
検査に失敗した場合、既存の出力は更新しない。

## 公開する

PRの `PR Explain` が成功して地図が配置された後、検証した解説を公開する。

```bash
bash .github/scripts/pr-explain-pages.sh put-explain 123 /tmp/pdfmod-explain.json
```

`origin` にpushできる認証が必要。解説のSHAがリモート追跡ブランチにない場合は拒否するため、push・fetchを済ませる。
終了コード3は地図未配置または削除済み。PRが開いていて生成CIが成功しているか確認する。
解説と地図のSHAが異なる場合は古い解説として帯を表示する。変更後は最新SHAで書き直す。

通常は `gh-pages` へのpushで `PR Explain Deploy` が起動する。`GITHUB_TOKEN` のpushでは別のpush workflowが起動しないため、
自動生成側は `workflow_run` でもデプロイを起動する。手動公開で同じ制限のある認証を使う場合は、Actions画面からdeployを手動実行する。
公開CI成功とPRコメントのリンクを確認して完了とする。PRを閉じるとそのPRのフォルダを削除し、既存コメントも閉鎖表示へ更新する。

## 検査と制限

```bash
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s harness/tests -p 'test_pr*.py' -v
```

`PR Explain Check` で同じ検査を行う。実Git差分、改名、抜粋と参照の検証、CSP、5画面の描画ロジック、
ローカルbare remoteへの配置・削除・競合時の再試行、公開後コメントを検査する。Node.jsがなければ描画・コメント検査はskipする。

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
