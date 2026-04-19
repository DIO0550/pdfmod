# FlateDecode ストリームパーサ

FlateDecode（zlib）展開と xref ストリーム TrailerDict 抽出を実装するモジュール群。Issue #35 で追加。

## PDF仕様解説

### FlateDecode フィルタ（ISO 32000-1 §7.4.4）

PDF で最も広く使われる圧縮フィルタ。zlib/deflate（RFC 1950 / RFC 1951）形式でストリームデータを圧縮する。

```
<< /Length 1234
   /Filter /FlateDecode
>>
stream
... (zlib圧縮データ) ...
endstream
```

展開後のデータには Predictor（PNG フィルタ等）による逆変換が必要な場合がある（`/DecodeParms` の `/Predictor` キーで指定）。本モジュールは純粋な zlib 展開のみを担当し、Predictor 逆変換は呼び出し側の責務とする。

### xref ストリームの TrailerDict（ISO 32000-1 §7.5.8.2）

従来の PDF ではファイル末尾に `trailer << ... >>` セクションが独立して存在するが、xref ストリーム形式ではストリームオブジェクトの辞書部分に trailer 情報が統合される。

| キー | 型 | 必須 | 説明 |
|:-----|:---|:-----|:-----|
| `/Root` | 間接参照 | 必須 | カタログ辞書への参照 |
| `/Size` | 整数 | 必須 | xref テーブル内の最大オブジェクト番号 + 1 |
| `/Prev` | 整数 | 任意 | 前の xref セクションのバイトオフセット |
| `/Info` | 間接参照 | 任意 | ドキュメント情報辞書への参照 |
| `/ID` | 配列 | 任意 | 2要素の文字列配列（ドキュメントID） |

テキスト形式 xref テーブルの `trailer` セクションとフィールドは同一だが、xref ストリームでは辞書内に直接含まれる点が異なる。

## 実装解説

本 PR では以下の 3 モジュールを追加・変更した。

### 1. decompressFlate — FlateDecode 展開

```typescript
function decompressFlate(
  data: Uint8Array,
  maxDecompressedSize?: number,
): Promise<Result<Uint8Array, PdfParseError>>;
```

**ファイル:** `packages/core/src/xref/stream/flatedecode.ts`

Web Streams API の `DecompressionStream('deflate')` を使用した非同期 zlib 展開。外部ライブラリに依存せず、ブラウザ・Node.js 双方で動作する。

#### 処理フロー

```
入力バリデーション
  ├── maxDecompressedSize: 有限・正・安全整数であること
  └── data.length > 0 であること
         │
         ▼
DecompressionStream 生成
  ├── writer: 圧縮データを書き込み → close
  └── reader: 展開データを読み取り
         │
         ▼
展開ループ（growing buffer 方式）
  ├── チャンク受信ごとに totalLength を更新
  ├── totalLength > maxDecompressedSize → cancel/abort してエラー返却
  ├── バッファ容量不足 → 倍々拡張（min(max(totalLength, capacity*2), maxDecompressedSize)）
  └── チャンクを result バッファに直接書き込み
         │
         ▼
writePromise 完了待ち
  ├── writeError あり → FLATEDECODE_FAILED
  └── なし → result.subarray(0, totalLength) を Ok で返却
```

#### メモリ管理

従来の「chunks 配列に蓄積 → 最後に結合」方式ではピークメモリが約 2 倍になる問題がある。本実装では **growing single buffer** 方式を採用:

- **初期バッファ:** `min(maxDecompressedSize, 1MB)`
- **拡張戦略:** `min(max(totalLength, capacity * 2), maxDecompressedSize)`
- **拡張時コピー:** `result.subarray(0, previousLength)` で書き込み済み部分のみコピー（未使用末尾を除外）
- **最終返却:** `result.subarray(0, totalLength)` で実データのみのビュー（コピーなし）

#### セキュリティ（zip bomb 対策）

`maxDecompressedSize`（デフォルト 100MB）により展開後サイズを制限:

- 展開ループ中に `totalLength > maxDecompressedSize` を検知
- `reader.cancel()` / `writer.abort()` でストリームを停止（`.catch(() => {})` で失敗を無視し、エラーが外側 catch に漏れるのを防止）
- `FLATEDECODE_FAILED` エラーを返却

#### エラーハンドリング

| ケース | エラーメッセージ |
|:-------|:----------------|
| maxDecompressedSize が不正（NaN/Infinity/負値/0） | `"Invalid maxDecompressedSize: must be a finite, positive safe integer"` |
| 空の入力データ | `"Empty input data cannot be a valid zlib payload"` |
| 展開サイズ超過 | `"Decompressed size exceeds limit of N bytes"` |
| writer 側の書き込み/close エラー | `"FlateDecode decompression failed during write"` |
| その他の展開エラー | `"FlateDecode decompression failed"` |

#### 型の注意点

`WritableStreamDefaultWriter.write()` の TypeScript 型定義では `BufferSource` が `ArrayBufferView<ArrayBuffer>` に限定されており、`Uint8Array<ArrayBufferLike>` と互換性がない。実行時には問題なく動作するため、`data as unknown as BufferSource` でキャストしている。

### 2. buildXRefStreamTrailerDict — TrailerDict 抽出

```typescript
function buildXRefStreamTrailerDict(
  dict: ReadonlyMap<string, PdfValue>,
): Result<TrailerDict, PdfParseError>;
```

**ファイル:** `packages/core/src/xref/stream/trailer/index.ts`

パース済みの xref ストリーム辞書（`Map<string, PdfValue>`）から TrailerDict を構築する。内部で共通ビルダー `trailerDictBuilder` を呼び出し、オプションフィールドの失敗（`TRAILER_DICT_INVALID`）はファイルローカルの `mapErr` ヘルパで外部契約コード `XREF_STREAM_INVALID` に書き換える。必須フィールド由来の `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND` は素通しで外部契約を維持する。

#### 処理フロー

```
dict.get("Root") → builder.root()
dict.get("Size") → builder.size()
dict.get("Prev") → builder.prev()
dict.get("Info") → builder.info()
dict.get("ID")   → builder.id()
                  → builder.build()
```

### 3. trailerDictBuilder — 共通 TrailerDict ビルダー

```typescript
function trailerDictBuilder(): TrailerDictBuilderChain;
```

**ファイル:** `packages/core/src/xref/trailer/dict-builder/index.ts`

テキスト形式 trailer と xref ストリーム trailer の **TrailerDict 構築ロジックを共通化** するクロージャベースのビルダー。メソッドチェーンでフィールドを設定し、`build()` でバリデーション・構築を行う。

#### 設計方針

- **クロージャベース:** `const chain` オブジェクトをキャプチャし、各メソッドから `chain` を返す。`this` を使わないため、メソッドがデストラクチャリング等で分離されてもチェーンが壊れない
- **責務分離:** バリデータは呼び出し側の文脈を知らない。必須フィールド（`/Root`, `/Size`）は固有の `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND` を、オプションフィールド（`/Prev`, `/Info`, `/ID`）は固有の `TRAILER_DICT_INVALID` を返す。呼び出し側はファイルローカルの `mapErr` ヘルパで `TRAILER_DICT_INVALID` のみを文脈別コード（`XREF_STREAM_INVALID` / `XREF_TABLE_INVALID`）に書き換える

#### バリデーション詳細

各フィールドのバリデーションは型チェックと数値範囲チェックを分離し、正確なエラーメッセージを返す:

**`/Root`（必須）:**
| チェック | エラーメッセージ |
|:---------|:----------------|
| 欠落 | `"/Root entry is missing in trailer dictionary"` |
| indirect-ref でない | `"/Root entry is not an indirect reference"` |
| objectNumber が不正 | `"/Root entry has an invalid object number (must be a non-negative safe integer)"` |
| generationNumber が不正 | `"/Root entry has an invalid generation number (must be a non-negative safe integer)"` |
| generationNumber が範囲外 (>65535) | `"/Root entry has an invalid generation number (out of range)"` |

**`/Size`（必須）:**
| チェック | エラーメッセージ |
|:---------|:----------------|
| 欠落 | `"/Size entry is missing in trailer dictionary"` |
| 非負整数でない | `"/Size entry is not a non-negative integer"` |

**`/Prev`（オプション）:**  非負安全整数であること。

**`/Info`（オプション）:** `/Root` と同様に型チェック・objectNumber・generationNumber を個別検証。

**`/ID`（オプション）:** 2 要素の文字列配列であること。

### 4. FLATEDECODE_FAILED エラーコード

```typescript
type PdfParseErrorCode =
  | "INVALID_HEADER"
  | "STARTXREF_NOT_FOUND"
  | "XREF_TABLE_INVALID"
  | "XREF_STREAM_INVALID"
  | "ROOT_NOT_FOUND"
  | "SIZE_NOT_FOUND"
  | "MEDIABOX_NOT_FOUND"
  | "NESTING_TOO_DEEP"
  | "FLATEDECODE_FAILED";  // ← 今回追加
```

FlateDecode 展開に関するすべてのエラーに使用する汎用コード。

## テスト構成

テストファイルはテスト対象と同じディレクトリに配置（`__tests__/` は使用しない）。

### flatedecode テスト

| ファイル | テスト内容 | テスト数 |
|:---------|:----------|:---------|
| `flatedecode.decode.test.ts` | 正常展開（短いデータ、空データ、冪等性、数KB） | 4 |
| `flatedecode.validation.test.ts` | 不正データ、空入力、maxDecompressedSize 超過 | 3 |
| `flatedecode.edge.test.ts` | 切り詰めデータ、ヘッダのみ | 2 |

### xref-stream-trailer テスト

| ファイル | テスト内容 | テスト数 |
|:---------|:----------|:---------|
| `xref-stream-trailer.validation.test.ts` | /Root, /Size, /Prev, /Info, /ID の各種バリデーション | 14 |
| `xref-stream-trailer.decode.test.ts` | 正常構築（必須のみ、全フィールド） | 2 |
| `xref-stream-trailer.edge.test.ts` | 空辞書、余分なキー、オプション全省略 | 3 |

### PdfParseErrorCode 網羅性テスト

`pdf-error.type-export.test.ts` で `as const satisfies` + `Exact` 型を使用し、リテラル配列と Union 型の相互一致をコンパイル時に保証。新しいエラーコードが追加された場合、配列の更新漏れが型エラーとして検出される。

## パイプライン上の位置づけ

```
scanStartXRef
  │
  ├── parseXRefTable ──→ TrailerParser ──→ ObjectResolver
  │                         │
  │                    trailerDictBuilder（共通）
  │                         │
  └── parseXRefStream ─→ buildXRefStreamTrailerDict
           │
           ├── decompressFlate ← 今回実装（XS-005）
           │
           └── decodeXRefStreamEntries（実装済み）
```

- `decompressFlate` は xref ストリームの圧縮データを展開するために使用される
- `buildXRefStreamTrailerDict` は xref ストリーム辞書から trailer 情報を抽出する
- `trailerDictBuilder` はテキスト形式 trailer パーサと xref ストリーム trailer の両方から共通利用される
- 上位の `parseXRefStream`（別 Issue）がこれらを組み合わせて xref ストリーム全体のパースを行う

## エクスポート

以下の API が `@pdfmod/core` からエクスポートされている:

```typescript
// FlateDecode 展開
export { decompressFlate } from "./xref/stream/flatedecode";

// xref ストリーム TrailerDict 構築
export { buildXRefStreamTrailerDict } from "./xref/stream/trailer";

// 共通 TrailerDict ビルダー
export { trailerDictBuilder } from "./xref/trailer/dict-builder";
```
