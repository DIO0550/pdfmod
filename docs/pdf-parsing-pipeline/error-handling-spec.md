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

```typescript
/** Parse error codes */
type PdfParseErrorCode =
  | "INVALID_HEADER"
  | "STARTXREF_NOT_FOUND"
  | "ROOT_NOT_FOUND"
  | "SIZE_NOT_FOUND"
  | "MEDIABOX_NOT_FOUND"
  | "NESTING_TOO_DEEP";

/** All fatal PDF error codes */
type PdfErrorCode = PdfParseErrorCode | "CIRCULAR_REFERENCE" | "TYPE_MISMATCH";

/** Parse error — unrecoverable structural/syntactic problem */
interface PdfParseError {
  readonly code: PdfParseErrorCode;
  readonly message: string;
  readonly offset?: number;
}

/** Circular reference detected during object resolution */
interface PdfCircularReferenceError {
  readonly code: "CIRCULAR_REFERENCE";
  readonly message: string;
  readonly objectId: ObjectId;
}

/** PDF object type does not match expected type */
interface PdfTypeMismatchError {
  readonly code: "TYPE_MISMATCH";
  readonly message: string;
  readonly expected: string;
  readonly actual: string;
}

/** Discriminated union of all fatal PDF errors */
type PdfError = PdfParseError | PdfCircularReferenceError | PdfTypeMismatchError;
```

### Result 型

```typescript
type Result<T, E> = { ok: true; value: T } | { ok: false; error: E };

// ヘルパー関数
const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = <E>(error: E): Err<E> => ({ ok: false, error });
```

### 警告（回復可能な問題）

```typescript
interface PdfWarning {
  /** 警告コード */
  readonly code: PdfWarningCode;
  /** 人間が読めるメッセージ */
  readonly message: string;
  /** 問題が発生したバイトオフセット */
  readonly offset?: number;
  /** 適用されたフォールバック処理 */
  readonly recovery?: string;
}
```

## 使用例

```typescript
// エラーの返却
function parseHeader(bytes: Uint8Array): Result<PdfHeader, PdfError> {
  if (!startsWithPdfMagic(bytes)) {
    return err({
      code: "INVALID_HEADER",
      message: "Invalid PDF header: expected %PDF-",
      offset: 0,
    });
  }
  return ok(header);
}

// エラーの処理（code で narrowing）
const result = parseHeader(bytes);
if (!result.ok) {
  switch (result.error.code) {
    case "INVALID_HEADER":
      console.error(`offset: ${result.error.offset}`); // offset にアクセス可能
      break;
    case "CIRCULAR_REFERENCE":
      console.error(`object: ${result.error.objectId}`); // objectId にアクセス可能
      break;
    case "TYPE_MISMATCH":
      console.error(`expected ${result.error.expected}, got ${result.error.actual}`);
      break;
  }
}
```

## エラー/警告コード一覧

### 致命的エラー（Result の err で返却）

| コード | 型 | 発生条件 | メッセージ例 |
|:-------|:---|:---------|:-----------|
| `INVALID_HEADER` | PdfParseError | ヘッダが`%PDF-`で始まらない | "Invalid PDF header: expected %PDF-" |
| `STARTXREF_NOT_FOUND` | PdfParseError | startxrefが検出できない（フォールバック後も） | "startxref not found in file" |
| `ROOT_NOT_FOUND` | PdfParseError | `/Root`がトレイラに存在しない | "Trailer missing required /Root entry" |
| `SIZE_NOT_FOUND` | PdfParseError | `/Size`がトレイラに存在しない | "Trailer missing required /Size entry" |
| `MEDIABOX_NOT_FOUND` | PdfParseError | ルートまで辿ってもMediaBox未定義 | "Page {n}: MediaBox not found in page or ancestors" |
| `CIRCULAR_REFERENCE` | PdfCircularReferenceError | オブジェクト解決で循環検出 | "Circular reference detected: object {id}" |
| `TYPE_MISMATCH` | PdfTypeMismatchError | resolveAs()で型不一致 | "Expected dictionary but got array" |
| `NESTING_TOO_DEEP` | PdfParseError | 配列/辞書のネストが100段超 | "Object nesting exceeds maximum depth (100)" |

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
| `DATE_PARSE_FAILED` | PDF日時文字列のパース失敗 | undefinedを設定 |

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

```typescript
// LoadOptions.onWarning コールバック
const doc = await PdfDocument.load(data, {
  onWarning: (warning: PdfWarning) => {
    console.warn(`[${warning.code}] ${warning.message}`);
    if (warning.recovery) {
      console.warn(`  Recovery: ${warning.recovery}`);
    }
  },
});

// 警告が通知されない場合（onWarning未設定）
// → 警告は無視され、寛容処理は暗黙的に適用される
```

## ファイル配置

```
packages/core/src/
├── errors/
│   ├── index.ts          # 再エクスポート
│   ├── pdf-error.ts      # PdfError discriminated union + PdfErrorCode
│   └── pdf-warning.ts    # PdfWarning インターフェース
├── result/
│   ├── index.ts          # 再エクスポート
│   └── result.ts         # Result<T, E> 型 + ok/err/map/flatMap/mapErr/unwrapOr
├── xref/
│   └── fallback-scanner.ts   # フォールバックXRefスキャナ
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) - xrefパース失敗時のフォールバック
- [object-resolver-spec.md](./object-resolver-spec.md) - 循環参照検出、オフセットずれ修正
- [page-tree-spec.md](./page-tree-spec.md) - ページツリー循環検出、属性継承失敗
- [document-api-spec.md](./document-api-spec.md) - LoadOptions.onWarning
