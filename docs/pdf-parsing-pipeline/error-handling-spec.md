# PDF解析パイプライン - エラーハンドリング仕様

> **上位目次**: [PDF解析パイプライン仕様](./index.md)  
> **位置づけ**: PDF 解析パイプラインにおける **エラーコード・警告コード一覧の正本**  
> **関連仕様**: [09. ライブラリ実装ガイド §3](../specs/09_implementation_guide.md#3-構造的なカオスへの対処) / [パブリック API 仕様](./document-api-spec.md)

## 目次

1. [概要](#概要)
2. [エラー設計方針](#エラー設計方針)
3. [エラー型（discriminated union）](#エラー型discriminated-union)
4. [エラー/警告コード一覧](#エラー警告コード一覧)
5. [フォールバックメカニズム](#フォールバックメカニズム)
6. [警告の通知方法](#警告の通知方法)
7. [ファイル配置](#ファイル配置)

---

## 概要

PDF 解析パイプラインのエラー体系と回復方針を定義します。基本方針は **Postel の法則（寛容処理優先）** に基づき、壊れた PDF でも可能な限り解析を継続します。回復不能なエラーは `Result<T, PdfError>` の `Err` で返し、回復可能な問題は `PdfWarning` として通知します。

## エラー設計方針

```text
問題検出
  │
  ▼
処理を継続できるか？ ── はい ──▶ 警告 (PdfWarning) を通知して続行
  │ いいえ
  ▼
フォールバック手段があるか？ ── はい ──▶ フォールバック実行 + 警告通知
  │ いいえ
  ▼
Result の Err でエラーを返却
```

### 例外ではなく `Result` 型を使う理由

- PDF の解析エラーは「予期される通常の結果」であり、例外的事態ではない。
- `try-catch` は型でハンドリングを強制できず、呼び出し漏れが起きやすい。
- `Result<T, E>` は discriminated union で型安全に絞り込み（narrowing）でき、パイプライン合成とも相性が良い。
- 例外のスタックトレース生成コストを回避できる。

---

## エラー型（discriminated union）

`PdfError` は次の 3 種類のエラー型の直和型です。いずれも共通フィールドとして `code`（エラーコード）と `message`（人間可読メッセージ）を持ち、`code` で型を判別できます（プログラマエラーとして `Err` に載せる組み込み `RangeError` は共通フィールド規約の対象外）。

| エラー型 | 追加フィールド | 説明 |
| :--- | :--- | :--- |
| `PdfParseError` | `offset`（任意）: 問題発生位置のバイトオフセット | 回復不能な構造的・構文的問題を表すパースエラー |
| `PdfCircularReferenceError` | `objectId`: 循環を検出したオブジェクト識別子（番号・世代） | オブジェクト解決中に検出された循環参照 |
| `PdfTypeMismatchError` | `expected`: 期待した型名 / `actual`: 実際の型名 | PDF オブジェクトの型が期待と一致しない |

### `Result` 型

`Result<T, E>` は成功（`ok: true`, `value`）または失敗（`ok: false`, `error`）の直和型です。呼び出し側は `ok` フラグで分岐し、失敗時は `error.code` で具体的なエラー型固有のフィールド（`offset`・`objectId`・`expected`/`actual` 等）へアクセスします。

### 警告（`PdfWarning`）

寛容処理によって回復した問題を表すオブジェクトです。

| フィールド | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `code` | 警告コード | はい | 後述の警告コード一覧で定義されたコード |
| `message` | 文字列 | はい | 人間可読なメッセージ |
| `offset` | 整数 | いいえ | 問題が発生したバイトオフセット |
| `recovery` | 文字列 | いいえ | 適用したフォールバック処理の説明 |

---

## エラー/警告コード一覧

> **権威の範囲**: 本一覧は **PDF 解析パイプライン（Phase 1 + 2）のエラー/警告コードの正本** です。コンテンツストリーム解釈（Phase 3）などの他機能のコード（`CONTENT_STREAM_*` / `OPERATOR_*` / `UNKNOWN_OPERATOR` / `EXT_GSTATE_*` / `COLOR_SPACE_*` 等）は各機能の仕様で定義します。本パイプラインへ新しいコードを追加する場合は、必ずここへ反映します。

### 致命的エラー（`Result` の `Err` で返却）

| コード | 型 | 発生条件 | メッセージ例 |
| :--- | :--- | :--- | :--- |
| `INVALID_HEADER` | `PdfParseError` | ヘッダが `%PDF-` で始まらない | `"Invalid PDF header: expected %PDF-"` |
| `STARTXREF_NOT_FOUND` | `PdfParseError` | `startxref` が検出できない（フォールバック後も） | `"startxref not found in file"` |
| `XREF_TABLE_INVALID` | `PdfParseError` | xref テーブル構造が不正（キーワード不在・エントリ不正・trailer 未検出等） | `"expected 'xref' keyword"` |
| `XREF_STREAM_INVALID` | `PdfParseError` | xref ストリーム構造が不正（`/W` 不正・エントリ長不整合等） | `"invalid /W array in xref stream"` |
| `XREF_PREV_CHAIN_CYCLE` | `PdfParseError` | `/Prev` チェーンが走査済みオフセットを指す | `"xref /Prev chain forms a cycle"` |
| `XREF_PREV_CHAIN_TOO_DEEP` | `PdfParseError` | `/Prev` チェーンが深度制限（100 段）を超過 | `"xref /Prev chain exceeds maximum depth"` |
| `FLATEDECODE_FAILED` | `PdfParseError` | FlateDecode 展開失敗（データ破損・展開後サイズ超過） | `"FlateDecode failed"` |
| `TRAILER_DICT_INVALID` | `PdfParseError` | trailer 辞書（xref ストリーム辞書含む）の構造が不正 | `"invalid trailer dictionary"` |
| `OBJECT_PARSE_UNEXPECTED_TOKEN` | `PdfParseError` | オブジェクトパース中の予期しないトークン | `"unexpected token"` |
| `OBJECT_PARSE_UNTERMINATED` | `PdfParseError` | 配列・辞書・オブジェクト定義が閉じられず EOF | `"unterminated object"` |
| `OBJECT_PARSE_STREAM_LENGTH` | `PdfParseError` | ストリームの `/Length` が確定できない（間接参照未解決・値域不正・範囲超過） | `"cannot determine stream /Length"` |
| `OBJECT_STREAM_INVALID` | `PdfParseError` | ObjStm 構造が不正（`/First`・`/N` 不正、格納禁止オブジェクト等） | `"invalid object stream"` |
| `OBJECT_STREAM_HEADER_INVALID` | `PdfParseError` | ObjStm オフセットテーブルが不正 | `"invalid object stream header"` |
| `OBJECT_STREAM_INDEX_OUT_OF_RANGE` | `PdfParseError` | ObjStm 内インデックスが `/N` 範囲外 | `"object stream index out of range"` |
| `PDF_TYPE_INVALID` | `PdfParseError` | 期待する PDF オブジェクト型と実際の型が不一致 | `"unexpected PDF object type"` |
| `PDF_FILTER_UNSUPPORTED` | `PdfParseError` | 未対応のストリームフィルタが指定された | `"unsupported stream filter"` |
| `TOKENIZER_POSITION_OUT_OF_RANGE` | `PdfParseError` | トークナイザの開始位置が入力範囲外 | `"tokenizer position out of range"` |
| `ENCRYPTED_PDF_UNSUPPORTED` | `PdfParseError` | trailer に `/Encrypt` が存在する（暗号化 PDF 未対応） | `"encrypted PDF is not supported"` |
| `ROOT_NOT_FOUND` | `PdfParseError` | `/Root` がトレイラに存在しない | `"Trailer missing required /Root entry"` |
| `CATALOG_ROOT_NOT_DICTIONARY` | `PdfParseError` | `/Root` の解決結果が辞書でない | `"/Root is not a dictionary"` |
| `CATALOG_TYPE_INVALID` | `PdfParseError` | カタログの `/Type` が `/Catalog` でない | `"catalog /Type is not /Catalog"` |
| `PAGES_NOT_FOUND` | `PdfParseError` | カタログに `/Pages` が存在しない・解決できない | `"catalog missing /Pages"` |
| `SIZE_NOT_FOUND` | `PdfParseError` | `/Size` がトレイラに存在しない | `"Trailer missing required /Size entry"` |
| `MEDIABOX_NOT_FOUND` | `PdfParseError` | ルートまで辿っても `/MediaBox` 未定義 | `"Page {n}: MediaBox not found in page or ancestors"` |
| `CIRCULAR_REFERENCE` | `PdfCircularReferenceError` | オブジェクト解決で循環検出 | `"Circular reference detected: object {id}"` |
| `TYPE_MISMATCH` | `PdfTypeMismatchError` | `resolveAs()` で型不一致 | `"Expected dictionary but got array"` |
| `NESTING_TOO_DEEP` | `PdfParseError` | 配列・辞書のネストが 100 段超 | `"Object nesting exceeds maximum depth (100)"` |

> **注（`startxref` 失敗時のコード）**: `STARTXREF_NOT_FOUND` は `startxref` 自体が検出できない場合に返します。フォールバックスキャナ経由で trailer / `/Root` の再構成にも失敗した場合は `ROOT_NOT_FOUND` を返します。

#### エラー型の表現に関する方針

- 上記 3 種のエラー型はすべて **値オブジェクト（interface）であり、`Result` の `Err` として返却する**（例外クラスとして `throw` しない）。
- プログラマエラー（API 誤用）も `throw` せず `Err` で返す（例: `PdfDocument.load()` の不正な `cacheCapacity` は `Err<RangeError>`）。値の有無だけを表す場面は `Option` を使う（例: `getPage()` 範囲外は `None`）。

### 警告（寛容処理で回復）

| コード | 発生条件 | 回復方法 |
| :--- | :--- | :--- |
| `EOF_NOT_FOUND` | `%%EOF` が末尾 1024 バイト以内に見つからない | スキャン範囲を最大 4096 バイトへ拡大 |
| `XREF_OFFSET_MISMATCH` | xref オフセット位置に `obj` キーワードがない | 前後 32 バイトで `N G obj` を探索 |
| `XREF_REBUILD` | xref テーブルの通常パースに失敗 | フォールバック xref スキャナで再構築 |
| `XREF_ENTRY_FORMAT` | xref エントリが 20 バイト固定長でない | EOL バリエーションを許容してパース |
| `PAGE_TREE_CYCLE` | ページツリーに循環参照 | 循環ノードをスキップして続行 |
| `COUNT_MISMATCH` | `/Count` と実際のページ数が不一致 | 実際のページ数を使用 |
| `INVALID_ROTATE` | `/Rotate` が `0 / 90 / 180 / 270` 以外 | 90 の倍数へ丸める |
| `STREAM_LENGTH_MISMATCH` | `/Length` 値と `endstream` 位置が不一致 | `endstream` キーワード位置から逆算 |
| `DUPLICATE_OBJECT` | 同一オブジェクト番号が重複 | 後方に定義されたものを優先 |
| `UNKNOWN_PAGE_TYPE` | ページノードの `/Type` が不明 | 警告してスキップ |
| `MISSING_KIDS` | `/Pages` ノードに `/Kids` がない・配列でない | ノードをスキップ |
| `PAGE_TREE_TOO_DEEP` | ページツリーの深度が上限（50）超 | 走査を打ち切り |
| `RESOURCES_RESOLVE_FAILED` | `/Resources` の間接参照解決に失敗 | 空辞書で続行 |
| `INFO_RESOLVE_FAILED` | `/Info` の間接参照解決に失敗 | メタデータを空で続行 |
| `INFO_NOT_DICTIONARY` | `/Info` の解決結果が辞書でない | メタデータを空で続行 |
| `TRAPPED_INVALID` | `/Trapped` が規定外の値 | unknown 扱いで続行 |
| `DATE_PARSE_FAILED` | PDF 日時文字列のパース失敗 | 未設定（`undefined`）にして続行 |
| `STRING_DECODE_FAILED` | テキスト文字列のデコード失敗（不正 UTF-16BE 等） | 元バイト列を保持しメタデータは未設定 |
| `GENERATION_MISMATCH` | 間接参照の世代番号が xref エントリと不一致 | `PdfNull` を返却して続行 |

---

## フォールバックメカニズム

### フォールバック XRef スキャナ

通常の xref 解析が失敗した場合（`startxref` 未検出、または xref パース失敗）の最終回復手段です。

```text
ファイル全体スキャン ──→ "N G obj" ヘッダ検出（番号・世代・オフセット収集）
                          ──→ XRefTable 再構築 + XREF_REBUILD 警告
                          ──→ trailer 辞書を後方探索（無ければ /Type /Catalog から /Root 推定）
```

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| FB-001 | 全体スキャン | xref 通常パース失敗 | `\d+ \d+ obj` パターンで全オブジェクトを検出 |
| FB-002 | trailer 探索 | xref スキャン後 | `trailer` キーワードを後方検索し辞書をパース |
| FB-003 | 重複解決 | 同一オブジェクト番号が複数存在 | 最もファイル末尾に近い定義を優先 |
| FB-004 | `/Root` 推定 | trailer が見つからない | `/Type /Catalog` を持つオブジェクトを探索 |

### ストリーム長の修正

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| SL-001 | `/Length` 信用 | 宣言長の位置に `endstream` がある | 宣言された長さを使用 |
| SL-002 | `/Length` 不正 | 宣言長の位置に `endstream` がない | `endstream` を直接探索して逆算 |
| SL-003 | `endstream` 前 EOL | `endstream` 直前に CR / LF がある | EOL を除外した位置をストリーム終端とする |

---

## 警告の通知方法

警告は `LoadOptions.onWarning` コールバック（[document-api-spec.md](./document-api-spec.md)）を通じて `PdfWarning` を 1 件ずつ通知します。`onWarning` 未設定時は警告を黙って破棄し、寛容処理（フォールバック）自体は適用されます。

## ファイル配置

```text
packages/core/src/
├── pdf/
│   └── errors/
│       ├── index.ts                        # 再エクスポート
│       ├── error/index.ts                  # PdfError discriminated union + PdfErrorCode
│       └── warning/index.ts                # PdfWarning インターフェース・警告コード
├── utils/
│   └── result/
│       └── index.ts                        # Result<T, E> 型 + ok / err / map / flatMap
└── xref/
    └── fallback/
        ├── fallback-scanner/index.ts       # フォールバック XRef スキャナ
        └── object-scanner/index.ts         # `N G obj` ヘッダのバイト走査ヘルパー
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) — xref パース失敗時のフォールバック
- [object-resolver-spec.md](./object-resolver-spec.md) — 循環参照検出、オフセットずれ修正
- [page-tree-spec.md](./page-tree-spec.md) — ページツリー循環検出、属性継承失敗
- [document-api-spec.md](./document-api-spec.md) — `LoadOptions.onWarning`
