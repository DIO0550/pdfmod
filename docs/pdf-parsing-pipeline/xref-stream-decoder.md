# XRef Stream Decoder

> **上位目次**: [PDF解析パイプライン仕様](./index.md) / [xref 解析仕様（統括）](./xref-parser-spec.md)  
> **対応規格**: ISO 32000-1:2008 §7.5.8（[02. 物理ファイル構造 §4.2](../specs/02_file_structure.md#42-xrefストリームpdf-15以降)）  
> **実装ファイル**: `packages/core/src/xref/stream/parser/index.ts`

展開済みの xref ストリームバイト列から各エントリをデコードし、`XRefTable` を構築する低レベルモジュールです。辞書解析・`/Type /XRef` 検証・ストリーム展開・trailer 抽出は上位の `XRefStreamParser`（[flatedecode-stream-parser.md](./flatedecode-stream-parser.md)）が担当します。

---

## PDF 仕様の要点

### `/W` 配列とバイナリエントリ構造

`/W [w0 w1 w2]` は各エントリの 3 フィールドのバイト幅を指定します。各フィールドは**ビッグエンディアン符号なし整数**として読み取ります。

```text
例: /W [1 3 1] → 1 エントリ = 5 バイト
+----------+--------------------+----------+
| Type(1B) |     Field2 (3B)    | Field3(1B)|
+----------+--------------------+----------+
    01           00 00 09            00
  → XRefUsedEntry { type: 1, offset: 9, generationNumber: 0 }
```

| フィールド | バイト幅 | Type 0（空き） | Type 1（通常） | Type 2（圧縮） | 幅 0 時の既定値 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| Type | `w0` | `0` | `1` | `2` | `1`（ISO Table 18） |
| Field2 | `w1` | 次空き obj 番号 | バイトオフセット | 親 ObjStm 番号 | `0` |
| Field3 | `w2` | 世代番号 | 世代番号 | ストリーム内インデックス | `0`（ISO Table 18） |

> 本モジュールは**構造デコードのみ**を担当し、意味論的検証は上位の責務とします。

### `/Index` 配列とテキスト形式との比較

- `/Index [firstObj count ...]` のペア列で対象オブジェクト番号範囲を指定します（省略時は `[0, /Size]`）。
- 例: `/Size 20 /Index [0 5 10 3]` → オブジェクト `0`〜`4`（5 個）と `10`〜`12`（3 個）の計 8 エントリが順に格納されます。

| 観点 | テキスト形式 xref | ストリーム形式 xref |
| :--- | :--- | :--- |
| 格納形式 | プレーンテキスト（固定 20 バイト） | バイナリ（`/W` で可変幅・圧縮可能） |
| `Type=2`（ObjStm） | 非対応 | 対応 |
| trailer | 直後に別セクション | ストリーム辞書に統合 |

---

## 実装仕様

### `decodeXRefStreamEntries(params)`

内部 API（`@pdfmod/core` からは直接 export しない）。

#### 入力型 `XRefStreamParams`

| フィールド | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `data` | バイト列 | **必須** | 展開済みストリームバイト列 |
| `w` | 整数 3 要素配列 | **必須** | `/W` 配列 `[w0, w1, w2]` |
| `size` | 整数 | **必須** | `/Size` 値 |
| `index` | 整数配列 | 任意 | `/Index` 配列（省略時は `[0, size]`） |
| `baseOffset` | `ByteOffset` | 任意 | エラー報告用のストリーム開始オフセット（省略時 `0`） |

- **出力**: `Result<XRefTable, PdfParseError>`

#### 処理アルゴリズム

1. **入力バリデーション**: `/W` の各要素・`size` が非負安全整数であること、および `entryWidth = w[0] + w[1] + w[2]` が安全整数であることを確認。
2. **サブセクション解決**: `/Index` 未指定なら `[0, size]`。要素数が偶数、各 `firstObj` / `count` が非負安全整数、`firstObj + count <= size`、総エントリ数 `totalEntries` が安全整数であることを検証。
3. **データ長チェック**: `expectedBytes = totalEntries * entryWidth` が安全整数かつ `data.length === expectedBytes` を検証。
4. **エントリデコード**: 各エントリの 3 フィールドをビッグエンディアン符号なし整数として読み取り（幅 `0` は `0`、計算結果が `MAX_SAFE_INTEGER` 超過で `Err`）、既定値適用・Type 分岐・ブランド型検証を経てマップへ登録（重複キーは後勝ち）。
5. **結果返却**: `Ok({ entries, size })`。

#### エラーケース（エラーコード: `XREF_STREAM_INVALID`）

すべてのエラーは `throw` せず `Err({ code: "XREF_STREAM_INVALID", message, offset? })` で返します（`offset` は `baseOffset` + エントリ相対位置）。

| 検出タイミング | ケース | メッセージ例 |
| :--- | :--- | :--- |
| 入力バリデーション | `/W` に負値・非整数・非安全整数 | `"/W array element must be non-negative safe integer"` |
| 入力バリデーション | `size` が不正 | `"invalid /Size value"` |
| 入力バリデーション | `entryWidth` が安全整数超過 | `"entry width exceeds safe integer range"` |
| サブセクション解決 | `/Index` 要素数が奇数 | `"/Index array must have even number of elements"` |
| サブセクション解決 | `firstObj` / `count` が不正 | `"/Index firstObj must be non-negative safe integer"` |
| サブセクション解決 | `firstObj + count > size` | `"/Index range exceeds /Size"` |
| サブセクション解決 | `totalEntries` が安全整数超過 | `"total entry count exceeds safe integer range"` |
| データ長チェック | `expectedBytes` 超過 / データ長不一致 | `"stream data length mismatch: expected N, got M"` |
| エントリデコード | 未知の Type 値 | `"unknown xref entry type: N"` |
| エントリデコード | 整数デコードの安全整数超過 | `"decoded integer exceeds safe integer range"` |
| エントリデコード | ブランド型バリデーション失敗 | `"invalid ObjectNumber/ByteOffset/GenerationNumber: ..."` |

## 上位モジュールとの関係

```text
scanStartXRef ──→ parseXRefTable   ──→ TrailerParser ──→ XRefMerger ──→ ObjectStore
                  XRefStreamParser ────────────────────↗
                       └─→ decodeXRefStreamEntries（本モジュール）
```
