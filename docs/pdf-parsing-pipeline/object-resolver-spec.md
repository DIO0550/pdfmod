# PDF解析パイプライン - オブジェクト解決仕様

> **上位目次**: [PDF解析パイプライン仕様](./index.md)  
> **関連仕様**: [ObjectParser 詳細](./object-parser-spec.md) / [ObjStm 仕様](./object-stream-spec.md) / [02a. インダイレクトオブジェクト解決](../specs/02a_object_resolution.md)

## 概要

Token 列を `PdfObject` へ変換し（`ObjectParser`）、xref テーブルを用いて間接参照（`N G R`）を実体オブジェクトへ解決します（`ObjectResolver`、実装は `ObjectStore`）。LRU キャッシュと循環参照検出（単一チェーン・並行チェーン間）を備えます。

## モジュール構成

| モジュール | 責務 |
| :--- | :--- |
| `ObjectParser` | Token 列 → `PdfObject` 変換（配列・辞書・ストリームの再帰構築） |
| `ObjectResolver`（実装: `ObjectStore`） | 間接参照の解決、LRU キャッシュ、循環参照検出 |
| `ObjectStreamExtractor` | オブジェクトストリーム（ObjStm）内のオブジェクト抽出 |

---

## データ型

### `PdfObject`（10 バリアントの直和型）

| バリアント | 保持する値 | 説明 |
| :--- | :--- | :--- |
| `null` | なし | `null` オブジェクト |
| `boolean` | 真偽値 | 真偽値オブジェクト |
| `integer` | 整数 | 整数オブジェクト |
| `real` | 実数 | 実数オブジェクト |
| `string` | バイト列 + エンコーディング種別（`literal` / `hex`） | 文字列オブジェクト（元表記を保持） |
| `name` | 文字列 | 名前オブジェクト |
| `array` | `PdfObject` の順序付き列 | 配列オブジェクト |
| `dictionary` | 名前（文字列）→ `PdfObject` のマップ | 辞書オブジェクト |
| `stream` | 辞書 + バイト列（ストリームデータ） | ストリームオブジェクト |
| `indirect-ref` | `objectNumber`（整数）, `generationNumber`（整数） | 間接参照（`N G R`） |

### `ObjectId`

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `objectNumber` | 整数 | オブジェクト番号 |
| `generationNumber` | 整数 | 世代番号 |

---

## 処理仕様

### 1. `ObjectParser`

- **入力**: `Uint8Array` + オフセット（または Token 列）
- **出力**: `Result<PdfObject, PdfParseError>`

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| OP-001 | プリミティブ変換 | `Boolean` / `Integer` / `Real` / `Null` / `Name` トークン | 対応する `PdfObject` を生成 |
| OP-002 | 文字列変換 | `LiteralString` / `HexString` トークン | `Uint8Array` に変換して文字列オブジェクトを生成 |
| OP-003 | 配列パース | `[` トークン検出 | `]` まで再帰的に `PdfObject` を収集 |
| OP-004 | 辞書パース | `<<` トークン検出 | `>>` まで Name–Value ペアを収集しマップ格納 |
| OP-005 | ストリームパース | 辞書の直後に `stream` キーワード | `/Length` を読み取りデータ部分を切り出し |
| OP-006 | `/Length` 間接参照 | `/Length` が間接参照 | 先に解決して長さを確定 |
| OP-007 | 間接参照検出 | `Integer Integer Keyword("R")` パターン | 3 トークン先読みで `IndirectRef` を生成 |
| OP-008 | オブジェクト定義 | `Integer Integer Keyword("obj")` パターン | `endobj` までの内容をパース |
| OP-009 | ネスト深度制限 | 配列 / 辞書のネストが 100 段超 | `NESTING_TOO_DEEP` エラーを返す（DoS 防止） |

### 2. `ObjectResolver`（実装: `ObjectStore`）

- **入力**: `XRefTable` + PDF バイナリ全体のバイト列
- **出力**: `Result<PdfObject, PdfError>`

| 操作 | 内容 |
| :--- | :--- |
| `resolve(ref)` | 間接参照を解決して `PdfObject` を返す。循環検出時は `CIRCULAR_REFERENCE` エラー（OR-002 / OR-011） |
| `resolveAs(ref, expectedType)` | 期待バリアント（`dictionary` 等）を指定して解決。型不一致時は `TYPE_MISMATCH` エラー（OR-007） |

#### 解決フロー

```text
resolve(ref)
  ├─ LRU キャッシュヒット ──▶ キャッシュから即返却
  ├─ resolving Set / 待機グラフで循環検出 ──▶ Err(CIRCULAR_REFERENCE)
  ├─ xref 未登録 / type=0 (Free) ──▶ PdfNull を返却
  ├─ type=1 (Used) ──▶ 世代照合 → オフセットに seek → ObjectParser.parseIndirectObject()
  └─ type=2 (Compressed) ──▶ 世代=0 確認 → ObjectStreamExtractor.extract()
        │
        ▼
  キャッシュ格納 & resolving Set から除去 ──▶ PdfObject を返却
```

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| OR-001 | キャッシュヒット | LRU キャッシュに存在 | キャッシュから返却（xref 参照なし） |
| OR-002 | 循環参照検出（チェーン内） | `resolving` Set に既に存在 | `CIRCULAR_REFERENCE` エラー |
| OR-003 | xref 未登録 | オブジェクト番号が xref にない | `PdfNull` を返却 |
| OR-004 | 通常オブジェクト | `XRefEntry.type = 1` | `field2` のオフセットへ seek してパース |
| OR-005 | オブジェクトストリーム | `XRefEntry.type = 2` | `ObjectStreamExtractor` で抽出 |
| OR-006 | xref オフセットずれ | 指定位置に `obj` がない | 前後 32 バイト範囲で `N G obj` を探索（寛容処理） |
| OR-007 | 型チェック | `resolveAs()` で期待型と不一致 | `TYPE_MISMATCH` エラー |
| OR-008 | free エントリ | `XRefEntry.type = 0` | `PdfNull` を返却（削除済み参照、ISO 32000-1 §7.3.10） |
| OR-009 | 世代番号不一致 | 参照の世代とエントリの世代（`field3`）が不一致（`type=0/1`） | `PdfNull` を返却 + `GENERATION_MISMATCH` 警告 |
| OR-010 | 圧縮オブジェクトの世代 | `type = 2` かつ参照の世代 `!= 0` | 無効参照とみなし `PdfNull` + `GENERATION_MISMATCH` 警告（`field3` はインデックスのため世代照合に使わない） |
| OR-011 | 循環参照検出（チェーン間） | 並行解決の別チェーン待機時に待機グラフが自チェーンの解決中オブジェクトへ閉路を形成 | 待たずに `CIRCULAR_REFERENCE` エラー（閉路を閉じた側のみ失敗し、待たれている側の解決は継続） |

#### free エントリと世代番号の要点

- xref 未登録（OR-003）と free エントリ（OR-008）はいずれも `PdfNull` を返します（[02a章 §2.1・§4.2](../specs/02a_object_resolution.md) と整合）。
- LRU キャッシュのキーは `ObjectId`（`objectNumber` + `generationNumber`）であり、`type=2` は常に `generationNumber = 0` で格納・照会します。

#### LRU キャッシュ仕様

| 項目 | 仕様 |
| :--- | :--- |
| 既定容量 | 1024 エントリ（`LoadOptions.cacheCapacity` で変更可能） |
| 追い出し戦略 | LRU（最も古く使用されたエントリから追い出し） |
| キー | `ObjectId`（`objectNumber` + `generationNumber`） |
| スレッドセーフ | 不要（シングルスレッド前提） |

> **既知の制約**: 容量上限は**エントリ数**ベースでありバイト量ベースではありません。大きなストリームオブジェクトを多数キャッシュした場合、エントリ上限内でもメモリ消費が増えうる点に留意してください。

### 3. `ObjectStreamExtractor`

- **入力**: `ObjectResolver` + ストリームオブジェクト番号 + インデックス
- **出力**: `Result<PdfObject, PdfParseError>`

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| OS-001 | ストリーム解決 | 親 ObjStm を `resolve` | ストリームデータを展開 |
| OS-002 | `/First` 取得 | ストリーム辞書の `/First` | オブジェクトデータ開始オフセットを取得 |
| OS-003 | `/N` 取得 | ストリーム辞書の `/N` | 格納オブジェクト数を取得 |
| OS-004 | ヘッダパース | オフセットテーブル（`objNum offset` ペア） | インデックスに対応するオフセットを特定 |
| OS-005 | オブジェクト抽出 | 特定オフセットから `ObjectParser` | 対象オブジェクトをパース |
| OS-006 | ストリームキャッシュ | 同一 ObjStm への複数アクセス | 展開済みストリームデータをキャッシュ |

---

## ファイル配置

```text
packages/core/src/
├── objects/
│   ├── index.ts                      # 再エクスポート
│   ├── object-parser/                # ObjectParser（Token 列 → PdfObject）
│   ├── object-store/                 # ObjectStore（ObjectResolver 実装）
│   └── object-stream-extractor/      # ObjectStreamExtractor（ObjStm 抽出）
└── utils/
    └── lru-cache/                    # LRUCache
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) — `ObjectStore` が使用する xref テーブルを提供
- [page-tree-spec.md](./page-tree-spec.md) — `ObjectStore` を使ってページツリーを走査
- [error-handling-spec.md](./error-handling-spec.md) — `PdfCircularReferenceError`, `PdfTypeMismatchError`
- [01. レキシカル規約](../specs/01_lexical_conventions.md) — 9 つのプリミティブ型の仕様
