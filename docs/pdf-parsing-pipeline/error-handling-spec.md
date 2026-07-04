# PDF解析パイプライン - エラーハンドリング仕様

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## 概要

PDF解析パイプラインのエラー体系を定義する。基本方針はPostelの法則（寛容処理優先）に基づき、壊れたPDFでも可能な限り解析を継続する。回復不能なエラーは `Result<T, PdfError>` 型で表現し、回復可能な問題は警告コールバックで通知する。

## エラー設計方針

```
エラーレベルの判定フロー:

    問題検出
      │
      ▼
┌──────────────┐   はい
│ 処理を継続     │──────▶ 警告 (PdfWarning) を通知して続行
│ できるか？     │
└──────────────┘
      │ いいえ
      ▼
┌──────────────┐   はい
│ フォールバック  │──────▶ フォールバック処理を実行 + 警告通知
│ 手段があるか？ │
└──────────────┘
      │ いいえ
      ▼
  Result の err() でエラーを返却
```

### 例外ではなく Result 型を使う理由

- PDFの解析エラーは「予期される結果」であり、例外的事態ではない
- `try-catch` は型で強制できず、呼び出し側がハンドリングを忘れるリスクがある
- `Result<T, E>` は discriminated union で型安全に narrowing できる
- パイプラインアーキテクチャとの関数的な合成に適している
- 例外のスタックトレース生成コストを回避できる

## エラー型（discriminated union）

エラーコードは後述の「エラー/警告コード一覧」表で定義する（重複定義を持たず、当該表が唯一の権威である）。

`PdfError` は以下の3つのエラー型の直和型である。この3種は共通フィールドとして `code`（エラーコード）と `message`（人間が読めるメッセージ）を持ち、`code` フィールドで型を判別できる（プログラマエラーとして `Err` に載せる `RangeError` は組み込みエラーであり、この共通フィールド規約の対象外）。

| エラー型 | 追加フィールド | 説明 |
|:---------|:---------------|:-----|
| `PdfParseError` | `offset`（省略可）: 問題発生位置のバイトオフセット | 回復不能な構造的・構文的問題を表すパースエラー |
| `PdfCircularReferenceError` | `objectId`: 循環を検出したオブジェクトの識別子（オブジェクト番号・世代番号） | オブジェクト解決中に検出された循環参照 |
| `PdfTypeMismatchError` | `expected`: 期待した型名、`actual`: 実際の型名 | PDFオブジェクトの型が期待した型と一致しない |

### Result 型

`Result<T, E>` は、成功（値を持つ `Ok`）か失敗（エラーを持つ `Err`）のいずれかを表す直和型であり、`ok` フラグ（真偽値）で判別できる。呼び出し側は `ok` フラグで分岐し、成功時は値に、失敗時はエラーにアクセスする。エラー側はさらに `code` フィールドで具体的なエラー型に判別でき、その型固有の追加フィールド（`offset`・`objectId`・`expected`/`actual` 等）を参照できる。

### 警告（回復可能な問題）

`PdfWarning` は寛容処理で回復した問題を表す。

| フィールド | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| `code` | 警告コード | はい | 警告コード（後述の警告一覧表で定義） |
| `message` | 文字列 | はい | 人間が読めるメッセージ |
| `offset` | 整数 | いいえ | 問題が発生したバイトオフセット |
| `recovery` | 文字列 | いいえ | 適用されたフォールバック処理の説明 |

## エラー/警告コード一覧

### 致命的エラー（Result の err で返却）

| コード | 型 | 発生条件 | メッセージ例 |
|:-------|:---|:---------|:-----------|
| `INVALID_HEADER` | PdfParseError | ヘッダが`%PDF-`で始まらない | "Invalid PDF header: expected %PDF-" |
| `STARTXREF_NOT_FOUND` | PdfParseError | startxrefが検出できない（フォールバック後も） | "startxref not found in file" |
| `XREF_TABLE_INVALID` | PdfParseError | xrefテーブルの構造が不正（キーワード不在、エントリ不正、trailer未検出など） | "expected 'xref' keyword" |
| `XREF_STREAM_INVALID` | PdfParseError | xrefストリームの構造が不正（/W不正、エントリ長不整合など） | "invalid /W array in xref stream" |
| `XREF_PREV_CHAIN_CYCLE` | PdfParseError | `/Prev`チェーンが走査済みオフセットを指す | "xref /Prev chain forms a cycle" |
| `XREF_PREV_CHAIN_TOO_DEEP` | PdfParseError | `/Prev`チェーンが深度制限（100段）を超過 | "xref /Prev chain exceeds maximum depth" |
| `FLATEDECODE_FAILED` | PdfParseError | FlateDecode展開の失敗（データ破損、展開後サイズ超過） | "FlateDecode failed" |
| `TRAILER_DICT_INVALID` | PdfParseError | trailer辞書（xrefストリーム辞書含む）の構造が不正 | "invalid trailer dictionary" |
| `OBJECT_PARSE_UNEXPECTED_TOKEN` | PdfParseError | オブジェクトパース中に予期しないトークンを検出 | "unexpected token" |
| `OBJECT_PARSE_UNTERMINATED` | PdfParseError | 配列/辞書/オブジェクト定義が終端されないままEOF | "unterminated object" |
| `OBJECT_PARSE_STREAM_LENGTH` | PdfParseError | ストリームの`/Length`が取得できない（間接参照未解決、値域不正、データ範囲超過） | "cannot determine stream /Length" |
| `OBJECT_STREAM_INVALID` | PdfParseError | ObjStm の構造が不正（/First・/N 不正、格納禁止オブジェクト等） | "invalid object stream" |
| `OBJECT_STREAM_HEADER_INVALID` | PdfParseError | ObjStm オフセットテーブルが不正 | "invalid object stream header" |
| `OBJECT_STREAM_INDEX_OUT_OF_RANGE` | PdfParseError | ObjStm 内インデックスが `/N` の範囲外 | "object stream index out of range" |
| `PDF_TYPE_INVALID` | PdfParseError | 期待するPDFオブジェクト型と実際の型が不一致 | "unexpected PDF object type" |
| `PDF_FILTER_UNSUPPORTED` | PdfParseError | 未対応のストリームフィルタが指定された | "unsupported stream filter" |
| `TOKENIZER_POSITION_OUT_OF_RANGE` | PdfParseError | トークナイザの開始位置が入力範囲外 | "tokenizer position out of range" |
| `ENCRYPTED_PDF_UNSUPPORTED` | PdfParseError | trailerに`/Encrypt`が存在する（暗号化PDFは未対応） | "encrypted PDF is not supported" |
| `ROOT_NOT_FOUND` | PdfParseError | `/Root`がトレイラに存在しない | "Trailer missing required /Root entry" |
| `CATALOG_ROOT_NOT_DICTIONARY` | PdfParseError | `/Root`の解決結果が辞書でない | "/Root is not a dictionary" |
| `CATALOG_TYPE_INVALID` | PdfParseError | カタログの`/Type`が`/Catalog`でない | "catalog /Type is not /Catalog" |
| `PAGES_NOT_FOUND` | PdfParseError | カタログに`/Pages`が存在しない・解決できない | "catalog missing /Pages" |
| `SIZE_NOT_FOUND` | PdfParseError | `/Size`がトレイラに存在しない | "Trailer missing required /Size entry" |
| `MEDIABOX_NOT_FOUND` | PdfParseError | ルートまで辿ってもMediaBox未定義 | "Page {n}: MediaBox not found in page or ancestors" |
| `CIRCULAR_REFERENCE` | PdfCircularReferenceError | オブジェクト解決で循環検出 | "Circular reference detected: object {id}" |
| `TYPE_MISMATCH` | PdfTypeMismatchError | resolveAs()で型不一致 | "Expected dictionary but got array" |
| `NESTING_TOO_DEEP` | PdfParseError | 配列/辞書のネストが100段超 | "Object nesting exceeds maximum depth (100)" |

> **注(startxref 失敗時のコード)**: `STARTXREF_NOT_FOUND` は startxref そのものが検出できない場合に返す。フォールバックスキャナ経由で trailer / `/Root` の再構成にも失敗した場合は `ROOT_NOT_FOUND` を返す。

### エラー型の表現に関する方針

- 本仕様のエラー型（`PdfParseError` / `PdfCircularReferenceError` / `PdfTypeMismatchError`）はすべて **interface であり、`Result` の error として返却される**。クラスとして `throw` しない。
- プログラマエラー（API の誤用）も throw せず `Err` で返す。例: `PdfDocument.load()` の不正な `cacheCapacity` は `Err<RangeError>` を返す（[document-api-spec.md](./document-api-spec.md)）。値の有無だけを表す場合は `Option` を使う（例: `getPage()` の範囲外は `None`）。
- 本ドキュメントのエラーコード一覧は**PDF解析パイプライン（本機能）のエラーコードの権威**である。コンテンツストリーム解釈（Phase 3）等の他機能のコード（`CONTENT_STREAM_*` / `OPERATOR_*` / `UNKNOWN_OPERATOR` 等）は各機能の仕様で定義する。本機能内で新しいコードを導入する場合は、必ず本一覧にも追加すること。

### 警告（寛容処理で回復）

| コード | 発生条件 | 回復方法 |
|:-------|:---------|:---------|
| `EOF_NOT_FOUND` | %%EOFが1024バイト以内に見つからない | スキャン範囲を4096バイトに拡大 |
| `XREF_OFFSET_MISMATCH` | xrefオフセットに`obj`キーワードがない | 前後32バイトで`N G obj`を探索 |
| `XREF_REBUILD` | xrefテーブルのパースに完全に失敗 | フォールバックxrefスキャナで再構築 |
| `XREF_ENTRY_FORMAT` | xrefエントリが20バイト固定長でない | EOLバリエーションを許容してパース |
| `PAGE_TREE_CYCLE` | ページツリーに循環参照 | 循環ノードをスキップして続行 |
| `COUNT_MISMATCH` | `/Count`と実際のページ数が不一致 | 実際のページ数を使用 |
| `INVALID_ROTATE` | Rotateが0/90/180/270以外 | 90の倍数に丸める |
| `STREAM_LENGTH_MISMATCH` | `/Length`値とendstream位置が不一致 | endstreamキーワードの位置から逆算 |
| `DUPLICATE_OBJECT` | 同一オブジェクト番号が重複 | 最後に定義されたものを優先 |
| `UNKNOWN_PAGE_TYPE` | ページノードの`/Type`が不明 | 警告してスキップ |
| `MISSING_KIDS` | Pagesノードに`/Kids`がない・配列でない | ノードをスキップ |
| `PAGE_TREE_TOO_DEEP` | ページツリーの深度が上限（50）超 | 走査を打ち切り |
| `RESOURCES_RESOLVE_FAILED` | `/Resources`の間接参照解決に失敗 | 空辞書で続行 |
| `INFO_RESOLVE_FAILED` | `/Info`の間接参照解決に失敗 | メタデータを空で続行 |
| `INFO_NOT_DICTIONARY` | `/Info`の解決結果が辞書でない | メタデータを空で続行 |
| `TRAPPED_INVALID` | `/Trapped`が規定外の値 | unknown 扱いで続行 |
| `DATE_PARSE_FAILED` | PDF日時文字列のパース失敗 | undefinedを設定 |
| `STRING_DECODE_FAILED` | テキスト文字列のデコード失敗（不正なUTF-16BE等） | 元のバイト列を保持しメタデータはundefined |
| `GENERATION_MISMATCH` | 間接参照の世代番号がxrefエントリと不一致 | PdfNullを返却して続行 |

## フォールバックメカニズム

### フォールバックXRefスキャナ

xrefテーブルの通常パースが完全に失敗した場合の最終手段。

**トリガー**: startxref未検出、またはxrefパースでエラー返却

**処理**:
1. ファイル全体をスキャンして `\d+ \d+ obj` パターンを検出
2. 各マッチからオブジェクト番号・世代番号・オフセットを抽出
3. 再構築したxrefテーブルを返却
4. `XREF_REBUILD` 警告を通知

```
ファイル全体スキャン
    │
    ▼
"N G obj" パターン検出（正規表現）
    │
    ▼
┌──────────────────────┐
│ オブジェクト番号: N    │
│ 世代番号: G            │
│ オフセット: マッチ位置  │
└──────────────────────┘
    │
    ▼ (全マッチを収集)
    │
XRefTable を再構築
    │
    ▼
trailer辞書を探索（"trailer" キーワード → 辞書パース）
```

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| FB-001 | 全体スキャン | xref通常パース失敗 | `\d+ \d+ obj` パターンで全オブジェクトを検出 |
| FB-002 | trailer探索 | xrefスキャン後 | `trailer` キーワードを後方検索し辞書をパース |
| FB-003 | 重複解決 | 同一オブジェクト番号が複数存在 | 最もファイル末尾に近いものを優先 |
| FB-004 | /Root推定 | trailerが見つからない | `/Type /Catalog` を持つオブジェクトを探索 |

### ストリーム長の修正

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| SL-001 | /Length信用 | 宣言長の位置にendstreamがある | 宣言された長さを使用 |
| SL-002 | /Length不正 | 宣言長の位置にendstreamがない | `endstream` を直接探索して逆算 |
| SL-003 | endstream前EOL | endstream直前にCR/LFがある | EOLを除外した位置をストリーム終端とする |

## 警告の通知方法

警告は `LoadOptions` の `onWarning` コールバック（[document-api-spec.md](./document-api-spec.md) 参照）を通じて、`PdfWarning` を1件ずつ渡して通知される。

`onWarning` が未設定の場合、警告は黙って破棄されるが、寛容処理（フォールバック）は暗黙的に適用される。

## ファイル配置

```
packages/core/src/
├── errors/
│   ├── index.ts          # 再エクスポート
│   ├── pdf-error.ts      # PdfError discriminated union + PdfErrorCode
│   └── pdf-warning.ts    # PdfWarning インターフェース
├── result/
│   ├── index.ts          # 再エクスポート
│   └── result.ts         # Result<T, E> 型 + ok/err/map/flatMap/unwrapOr
├── xref/
│   └── fallback/
│       ├── fallback-scanner.ts   # フォールバックXRefスキャナ
│       └── object-scanner.ts     # `\d+ \d+ obj` ヘッダのバイト走査ヘルパー
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) - xrefパース失敗時のフォールバック
- [object-resolver-spec.md](./object-resolver-spec.md) - 循環参照検出、オフセットずれ修正
- [page-tree-spec.md](./page-tree-spec.md) - ページツリー循環検出、属性継承失敗
- [document-api-spec.md](./document-api-spec.md) - LoadOptions.onWarning
