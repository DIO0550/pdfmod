# FlateDecode ストリームパーサ

> **上位目次**: [PDF解析パイプライン仕様](./index.md) / [xref 解析仕様（統括）](./xref-parser-spec.md)  
> **対応規格**: ISO 32000-1:2008 §7.4.4, §7.5.8.2（[07. データ圧縮とストリームフィルタ §3.1](../specs/07_compression_filters.md#31-flatedecode)）

FlateDecode（zlib）展開と、xref ストリーム・テキスト xref の共通 `TrailerDict` 抽出を担う 3 つの内部モジュールを定義します。

## 対象モジュール一覧

| モジュール | 実装ファイル | 責務 |
| :--- | :--- | :--- |
| `decompressFlate` | `packages/core/src/pdf/filter/flatedecode/index.ts` | Web Streams API による非同期 zlib 展開とサイズ上限防御 |
| `buildXRefStreamTrailerDict` | `packages/core/src/xref/stream/trailer/index.ts` | xref ストリーム辞書からの `TrailerDict` 抽出 |
| `trailerDictBuilder` | `packages/core/src/xref/trailer/dict-builder/index.ts` | テキスト形式・ストリーム形式共通の `TrailerDict` ビルダー |

---

## 1. `decompressFlate` — FlateDecode 展開

Web Streams API の `DecompressionStream("deflate")` を用い、外部ライブラリなしでブラウザ・Node.js 双方で動作する非同期 zlib 展開を行います（Predictor 逆変換は呼び出し側の責務）。

- **入力**: 圧縮データのバイト列 + 任意の展開後最大サイズ `maxDecompressedSize`（既定 100 MB）
- **出力**: `Promise<Result<Uint8Array, PdfParseError>>`（失敗時のエラーコードはすべて `FLATEDECODE_FAILED`）

### 処理フローとメモリ管理

```text
入力検証（maxDecompressedSize は有限・正の安全整数、data.length > 0）
  │
  ▼
DecompressionStream("deflate") 生成（writer 書き込み / reader 読み取り）
  │
  ▼
growing single buffer 展開ループ
  ├─ 初期バッファ: min(maxDecompressedSize, 1 MB)
  ├─ totalLength > maxDecompressedSize → reader.cancel() / writer.abort() → FLATEDECODE_FAILED
  ├─ 容量不足 → 倍々拡張: min(max(totalLength, capacity * 2), maxDecompressedSize)
  └─ 完了後 → writePromise エラー確認 → result.subarray(0, totalLength) をゼロコピー返却
```

> **growing single buffer を採用する理由**: チャンク配列へ蓄積してから最後に結合する方式ではピークメモリが展開サイズの約 2 倍になりますが、単一バッファ拡張方式では未使用末尾コピーを避けつつ実データビューを直接返せます。また Zip Bomb 対策としてループ中に `maxDecompressedSize` 超過を検知し即座にストリームを中断します（`cancel` / `abort` の失敗は `.catch(() => {})` で吸収）。

### エラーケース（コード: `FLATEDECODE_FAILED`）

| ケース | エラーメッセージ |
| :--- | :--- |
| `maxDecompressedSize` 不正（`NaN` / `Infinity` / `<= 0`） | `"Invalid maxDecompressedSize: must be a finite, positive safe integer"` |
| 空の入力データ | `"Empty input data cannot be a valid zlib payload"` |
| 展開サイズ超過 | `"Decompressed size exceeds limit of N bytes"` |
| writer 側の書き込み / close エラー | `"FlateDecode decompression failed during write"` |
| その他の展開エラー | `"FlateDecode decompression failed"` |

---

## 2. `buildXRefStreamTrailerDict` — xref ストリームからの TrailerDict 抽出

xref ストリーム形式では `trailer << ... >>` が独立せずストリーム辞書自体へ統合されます（ISO 32000-1 §7.5.8.2）。

- **入力**: パース済み xref ストリーム辞書（`ReadonlyMap<string, PdfValue>`）
- **出力**: `Result<TrailerDict, PdfParseError>`

```text
dict.get("Root") / "Size" / "Prev" / "Info" / "ID" / "Encrypt"
  ──→ trailerDictBuilder で構築・検証
  ──→ オプション項目由来の TRAILER_DICT_INVALID のみ XREF_STREAM_INVALID へ変換
      （必須項目由来の ROOT_NOT_FOUND / SIZE_NOT_FOUND はそのまま返却）
```

> `/XRefStm` はテキスト形式トレイラ専用（TR-006）のため、xref ストリーム辞書からは抽出しません。

---

## 3. `trailerDictBuilder` — 共通 `TrailerDict` ビルダー

テキスト形式とストリーム形式のトレイラ構築ロジックを共通化するクロージャベースのビルダーです。`this` を使わず `chain` オブジェクトをキャプチャするため、メソッドを分離してもチェーンが壊れません。

- **責務分離**: ビルダー自体は呼び出し元の文脈を知らず、必須項目は `ROOT_NOT_FOUND` / `SIZE_NOT_FOUND`、オプション項目は `TRAILER_DICT_INVALID` を返します。呼び出し側（テキスト / ストリーム）が文脈別コード（`XREF_TABLE_INVALID` / `XREF_STREAM_INVALID`）へマッピングします。

### フィールド別バリデーション

| キー | 必須 | 検証ルールと主なエラーメッセージ |
| :--- | :--- | :--- |
| `/Root` | **必須** | 欠落: `"/Root entry is missing in trailer dictionary"`<br>非参照: `"/Root entry is not an indirect reference"`<br>番号不正: `"/Root entry has an invalid object number (must be a non-negative safe integer)"`<br>世代不正: `"/Root entry has an invalid generation number (must be a non-negative safe integer)"`<br>世代超過 (>65535): `"/Root entry has an invalid generation number (out of range)"` |
| `/Size` | **必須** | 欠落: `"/Size entry is missing in trailer dictionary"`<br>非負整数でない: `"/Size entry is not a non-negative integer"` |
| `/Prev` | 任意 | 非負安全整数（`ByteOffset`）であること |
| `/Info` | 任意 | `/Root` と同様に型・`objectNumber`・`generationNumber` を個別検証 |
| `/ID` | 任意 | 2 要素の文字列配列であること |
| `/Encrypt` | 任意 | 辞書または間接参照であること（TR-005。内容は検証せず保持） |
| `/XRefStm` | 任意 | 非負安全整数であること（TR-006。テキスト形式トレイラのみで使用） |

---

## パイプライン上の位置づけ

```text
scanStartXRef
  ├─ parseXRefTable ──→ TrailerParser ───────────→ ObjectStore
  │                        │
  │                   trailerDictBuilder（共通）
  │                        │
  └─ XRefStreamParser ─→ buildXRefStreamTrailerDict
       ├─ decompressFlate（XS-005）
       └─ decodeXRefStreamEntries
```
