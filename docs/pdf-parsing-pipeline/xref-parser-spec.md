# PDF解析パイプライン - xref解析仕様（統括）

> **上位目次**: [PDF解析パイプライン仕様](./index.md)  
> **詳細仕様**: [startxref-scanner](./startxref-scanner.md) / [xref-table-parser](./xref-table-parser.md) / [xref-stream-decoder](./xref-stream-decoder.md) / [flatedecode-stream-parser](./flatedecode-stream-parser.md) / [xref-merger-spec](./xref-merger-spec.md)  
> **対応規格**: ISO 32000-1:2008 §7.5.4–7.5.8（[02. 物理ファイル構造](../specs/02_file_structure.md)）

## 概要

PDF ファイル末尾から `startxref` を検出し、テキスト形式・ストリーム形式の xref とトレイラ辞書を解析します。`/Prev` チェーンおよびハイブリッド参照（`/XRefStm`）を辿り、複数の更新を 1 つのマージ済み `XRefTable` に統合します。

## モジュール構成

| モジュール | 責務 | 詳細仕様 |
| :--- | :--- | :--- |
| `StartXRefScanner` | ファイル末尾から `startxref` オフセットを検出 | [startxref-scanner.md](./startxref-scanner.md) |
| `XRefTableParser` | テキスト形式 xref テーブルを解析 | [xref-table-parser.md](./xref-table-parser.md) |
| `XRefStreamParser` | ストリーム形式 xref（PDF 1.5+）を解析 | [xref-stream-decoder.md](./xref-stream-decoder.md) / [flatedecode-stream-parser.md](./flatedecode-stream-parser.md) |
| `TrailerParser` | トレイラ辞書を解析し `TrailerDict` を構築 | [flatedecode-stream-parser.md](./flatedecode-stream-parser.md) |
| `XRefMerger` | `/Prev` チェーンと `/XRefStm` を統合 | [xref-merger-spec.md](./xref-merger-spec.md) |

---

## データ型

### `XRefEntry`

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `type` | `0 \| 1 \| 2` | `0`=空き、`1`=通常オブジェクト、`2`=オブジェクトストリーム内 |
| `field2` | 整数 | `type=0`: 次空き番号、`type=1`: バイトオフセット、`type=2`: 親 ObjStm 番号 |
| `field3` | 整数 | `type=0,1`: 世代番号、`type=2`: ストリーム内インデックス |

### `XRefTable`

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `entries` | マップ（オブジェクト番号 → `XRefEntry`） | 各オブジェクトのエントリ |
| `size` | 整数 | 最大オブジェクト番号 + 1 |

### `TrailerDict`

| フィールド | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `root` | `IndirectRef` | **必須** | `/Root` — ドキュメントカタログへの参照 |
| `size` | 整数 | **必須** | `/Size` — xref テーブルのエントリ総数 |
| `prev` | `ByteOffset` | 任意 | `/Prev` — 前の xref セクションのバイトオフセット |
| `info` | `IndirectRef` | 任意 | `/Info` — ドキュメント情報辞書への参照 |
| `id` | バイト列 2 要素の組 | 任意 | `/ID` — ファイル識別子 `[永続ID, 変更ID]` |
| `encrypt` | 辞書 or `IndirectRef` | 任意 | `/Encrypt` — 暗号化辞書（存在時は暗号化 PDF として検出） |
| `xrefStm` | `ByteOffset` | 任意 | `/XRefStm` — ハイブリッド参照の相互参照ストリーム位置（テキスト trailer のみ） |

---

## 処理仕様

### 1. `StartXRefScanner`

- **入力**: `Uint8Array`（PDF バイナリ全体）
- **出力**: `Result<ByteOffset, PdfParseError>`

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| XR-001 | `%%EOF` 検出 | 末尾 1024 バイトを逆方向スキャン | `%%EOF` を後方検索 |
| XR-002 | `startxref` 検出 | `%%EOF` の上方向をスキャン | `startxref` 直後の整数オフセットを取得 |
| XR-003 | `%%EOF` 未検出 | 1024 バイト以内に見つからない | 最大 4096 バイトまで拡大（検出時は `EOF_NOT_FOUND` 警告） |
| XR-004 | `startxref` 未検出 | 検出できない | `STARTXREF_NOT_FOUND` エラー（上位でフォールバックスキャナへ委譲） |

### 2. `XRefTableParser`（テキスト形式）

- **入力**: `Uint8Array` + オフセット
- **出力**: `Result<{ xref: XRefTable, trailerOffset: ByteOffset }, PdfParseError>`

手順: `xref` キーワード確認 → サブセクション `{firstObj} {count}` 読み取り → 20 バイトエントリ群パース → 複数サブセクション反復 → `trailer` 位置を返却。

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| XT-001 | エントリ形式 | 20 バイト固定長 | `nnnnnnnnnn ggggg n\r\n` をパース |
| XT-002 | 状態フラグ | `n` = 使用中, `f` = 空き | `type=1` (`n`) / `type=0` (`f`) へ変換 |
| XT-003 | オブジェクト 0 | 世代 `65535` の空きオブジェクト | 空きリストのヘッドとして扱う |
| XT-004 | 複数サブセクション | 不連続なオブジェクト番号範囲 | 各サブセクションを順次パース |
| XT-005 | EOL バリエーション | CR+LF, LF, CR+SP, CR | すべてのパターンを寛容に受理 |

### 3. `XRefStreamParser`（ストリーム形式）

- **入力**: `Uint8Array` + オフセット + `ObjectParser`
- **出力**: `Result<{ xref: XRefTable, trailer: TrailerDict }, PdfParseError>`

手順: ストリームオブジェクト解析 → `/Type /XRef` 検証 → `/W` 取得 → ストリーム展開（FlateDecode / LZWDecode + Predictor） → バイナリを `XRefEntry` へデコード → 辞書から `TrailerDict` を抽出。

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| XS-001 | `/W` 配列 | `[w1, w2, w3]` | 1 エントリ = `w1 + w2 + w3` バイト |
| XS-002 | `/Index` 配列 | 存在する場合 | サブセクション範囲を指定 |
| XS-003 | `/Index` 不在 | 省略時 | 既定値 `[0, /Size]` として扱う |
| XS-004 | Type 幅 0 | `w1 = 0` | 既定値 `type = 1`（通常オブジェクト）として扱う |
| XS-005 | `/Filter` | `/FlateDecode` | Web Streams API の `DecompressionStream("deflate")` で展開（詳細は [flatedecode-stream-parser.md](./flatedecode-stream-parser.md)） |
| XS-006 | `/Prev` | 存在する場合 | 前の xref オフセットとして `TrailerDict` に格納 |

### 4. `TrailerParser`

- **入力**: `Uint8Array` + `trailerOffset` + `ObjectParser`
- **出力**: `Result<TrailerDict, PdfParseError>`

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| TR-001 | `/Root` 必須 | 未検出 | `ROOT_NOT_FOUND` エラー |
| TR-002 | `/Size` 必須 | 未検出 | `SIZE_NOT_FOUND` エラー |
| TR-003 | `/Prev` | 整数値 | 前の xref オフセットを記録 |
| TR-004 | `/ID` | 2 要素配列 | `Uint8Array` ペアへ変換 |
| TR-005 | `/Encrypt` | 存在する場合 | `TrailerDict.encrypt` に記録（上位の `PdfDocument.load` が `ENCRYPTED_PDF_UNSUPPORTED` を返す） |
| TR-006 | `/XRefStm` | 整数値（テキスト trailer のみ） | ハイブリッド参照の相互参照ストリーム位置を記録（XM-005） |

### 5. `XRefMerger`

- **入力**: `Uint8Array` + 最新 `startxref` オフセット
- **出力**: `Result<{ mergedXRef: XRefTable, trailer: TrailerDict }, PdfParseError>`

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| XM-001 | マージ順序 | 複数 xref 存在 | 新しい xref のエントリが古いエントリを上書き |
| XM-002 | 循環防止 | `/Prev` または `/XRefStm` が既訪問オフセット | `XREF_PREV_CHAIN_CYCLE` エラー |
| XM-003 | 深度制限 | `/Prev` チェーンが 100 段超過 | `XREF_PREV_CHAIN_TOO_DEEP` エラー |
| XM-004 | 形式混在 | テキスト形式とストリーム形式の混在 | コールバック側で形式判定し適切なパーサを呼び出し |
| XM-005 | ハイブリッド参照 | trailer に `/XRefStm` 存在 | 同一更新ではストリーム側エントリを優先し、`/Prev` はテキスト trailer 側のみ辿る |

> 詳細仕様と具体例は [xref-merger-spec.md](./xref-merger-spec.md) を参照してください。

---

## ファイル配置

```text
packages/core/src/
├── pdf/
│   ├── filter/flatedecode/index.ts        # FlateDecode 展開（decompressFlate）
│   └── types/pdf-types/index.ts           # XRefEntry, XRefTable, TrailerDict
└── xref/
    ├── index.ts                           # 再エクスポート
    ├── startxref/scanner/index.ts         # StartXRefScanner
    ├── table/parser/index.ts              # XRefTableParser
    ├── stream/
    │   ├── parse-xref-stream/index.ts     # XRefStreamParser 統合エントリ
    │   ├── parser/index.ts                # decodeXRefStreamEntries
    │   ├── dict/index.ts                  # xref ストリーム辞書検証
    │   ├── predictor/index.ts             # PNG / TIFF Predictor 逆変換
    │   └── trailer/index.ts               # buildXRefStreamTrailerDict
    ├── trailer/
    │   ├── parser/index.ts                # TrailerParser
    │   └── dict-builder/index.ts          # trailerDictBuilder（共通）
    └── merger/index.ts                    # XRefMerger
```

## 関連仕様

- [object-resolver-spec.md](./object-resolver-spec.md) — xref テーブルを用いたオブジェクト解決
- [error-handling-spec.md](./error-handling-spec.md) — フォールバック xref スキャナとエラーコード
- [02. 物理ファイル構造](../specs/02_file_structure.md) — ISO 32000 仕様詳細
