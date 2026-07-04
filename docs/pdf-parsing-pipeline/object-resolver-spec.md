# PDF解析パイプライン - オブジェクト解決仕様

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## 概要

Token列をPdfObjectに変換し（ObjectParser）、xrefテーブルを用いてインダイレクト参照（`N G R`）を実体オブジェクトに解決する（ObjectResolver）。LRUキャッシュと循環参照検出を備え、メモリ効率と安全性を両立する。

## モジュール構成

| モジュール | 責務 |
|:-----------|:-----|
| `ObjectParser` | Token列→PdfObject変換。辞書・配列・ストリームの再帰的構築 |
| `ObjectResolver` | インダイレクト参照の解決、LRUキャッシュ、循環参照検出 |
| `ObjectStreamExtractor` | オブジェクトストリーム内のオブジェクト抽出 |

## データ型

### PdfObject（直和型）

PdfObject は次の10バリアントのいずれかである。

| バリアント | 保持する値 | 説明 |
|:-----------|:-----------|:-----|
| `null` | なし | nullオブジェクト |
| `boolean` | 真偽値 | 真偽値オブジェクト |
| `integer` | 整数 | 整数オブジェクト |
| `real` | 実数 | 実数オブジェクト |
| `string` | バイト列、エンコーディング種別（`literal` または `hex`） | 文字列オブジェクト。元表記がリテラル文字列か16進文字列かを保持する |
| `name` | 文字列 | 名前オブジェクト |
| `array` | PdfObject の順序付き列 | 配列オブジェクト。要素は任意のPdfObject |
| `dictionary` | 名前（文字列）→ PdfObject のマップ | 辞書オブジェクト |
| `stream` | 辞書 + バイト列（ストリームデータ） | ストリームオブジェクト |
| `indirect-ref` | オブジェクト番号（整数）、世代番号（整数） | インダイレクト参照（`N G R`） |

### ObjectId

| フィールド | 型 | 説明 |
|:-----------|:---|:-----|
| objectNumber | 整数 | オブジェクト番号 |
| generationNumber | 整数 | 世代番号 |

## 処理仕様

### ObjectParser

**入力**: `Uint8Array` + オフセット（または Token列）
**出力**: `PdfObject`

Token列からPDFのプリミティブ9型 + インダイレクト参照をPdfObjectに変換する。

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| OP-001 | プリミティブ変換 | Boolean/Integer/Real/Null/Name トークン | 対応するPdfObjectを生成 |
| OP-002 | 文字列変換 | LiteralString/HexString トークン | Uint8Arrayに変換してPdfStringを生成 |
| OP-003 | 配列パース | `[` トークン検出 | `]` まで再帰的にPdfObjectを収集 |
| OP-004 | 辞書パース | `<<` トークン検出 | `>>` までName-Value ペアを収集してMapに格納 |
| OP-005 | ストリームパース | 辞書の後に `stream` キーワード | `/Length` を読み取りデータ部分をUint8Arrayとして切り出し |
| OP-006 | /Length間接参照 | `/Length` が間接参照 | ObjectResolverで先に解決してから長さを取得 |
| OP-007 | インダイレクト参照検出 | `Integer Integer Keyword("R")` パターン | 3トークンバックトラッキングでIndirectRefを生成 |
| OP-008 | オブジェクト定義 | `Integer Integer Keyword("obj")` パターン | `endobj` までの内容をPdfObjectとしてパース |
| OP-009 | ネスト深度制限 | 配列/辞書のネストが100段超 | `NESTING_TOO_DEEP` エラーを返す（DoS防止） |

### ObjectResolver

**入力**: `XRefTable` + PDFバイナリ全体のバイト列
**出力**: `PdfObject`（解決済み）

ObjectResolver は次の2つの解決操作を提供する。

- **resolve** — **入力**: インダイレクト参照。**出力**: 参照先を解決したPdfObject。
- **resolveAs** — 期待するPdfObjectのバリアント（`dictionary` 等）を指定して解決する。**入力**: インダイレクト参照 + 期待する型。**出力**: 成功時は期待した型に絞り込まれたPdfObject、解決結果の型が期待と不一致なら `TYPE_MISMATCH` エラーを Err で返す（OR-007）。

#### 解決フロー

```
resolve(ref)
    │
    ▼
┌─────────────────┐   ヒット
│ LRUキャッシュ確認 │──────────▶ キャッシュから返却
└─────────────────┘
    │ ミス
    ▼
┌─────────────────┐   検出
│ resolving Set    │──────────▶ Err(PdfCircularReferenceError)
│ に ref を追加     │
└─────────────────┘
    │ 初回
    ▼
┌─────────────────┐   未登録
│ xref lookup      │──────────▶ PdfNull を返却
└─────────────────┘
    │ 登録済み
    ├── type=1 (DirectOffset)
    │   └─▶ オフセットにseek → ObjectParser.parseIndirectObject()
    │
    └── type=2 (InObjectStream)
        └─▶ ObjectStreamExtractor.extract(streamObjNum, index)
    │
    ▼
┌─────────────────┐
│ キャッシュ格納     │
│ resolving Set    │
│ から ref を除去    │
└─────────────────┘
    │
    ▼
PdfObject を返却
```

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| OR-001 | キャッシュヒット | LRUキャッシュにエントリ存在 | キャッシュから返却（xref参照なし） |
| OR-002 | 循環参照検出 | resolving Set に既に存在 | `CIRCULAR_REFERENCE` エラーを返す |
| OR-003 | xref未登録 | オブジェクト番号がxrefに存在しない | PdfNull `{ type: "null" }` を返却 |
| OR-004 | 通常オブジェクト | XRefEntry.type = 1 | field2のオフセットにseek → パース |
| OR-005 | オブジェクトストリーム | XRefEntry.type = 2 | ObjectStreamExtractorで抽出 |
| OR-006 | xrefオフセットずれ | 指定オフセットに`obj`キーワードがない | 前後32バイト範囲で `N G obj` パターンを探索（寛容処理） |
| OR-007 | 型チェック | resolveAs() で期待型と不一致 | `TYPE_MISMATCH` エラーを返す |
| OR-008 | freeエントリ | XRefEntry.type = 0 | PdfNull `{ type: "null" }` を返却（削除済みオブジェクトへの参照。ISO 32000-1 §7.3.10） |
| OR-009 | 世代番号不一致 | 参照の世代番号がエントリの世代番号（field3）と不一致（type=0/1） | PdfNullを返却し `GENERATION_MISMATCH` 警告を通知 |
| OR-010 | 圧縮オブジェクトの世代 | XRefEntry.type = 2 | 格納オブジェクトの世代は常に0。世代番号≠0の参照はOR-009に従いPdfNullを返却 |

### freeエントリと世代番号の扱い

- xref に**未登録**の参照（OR-003）と **free エントリ**への参照（OR-008）は、いずれも「未定義オブジェクトへの参照」として PdfNull を返す（`docs/specs/02a_object_resolution.md` §2.1・§4.2 と整合）。
- 世代番号の照合は type=0/1 エントリで行う。type=2（ObjStm 内）は世代が常に 0 のため、参照側の世代が 0 でなければ無効な参照とみなす。
- LRU キャッシュのキーは `ObjectId`（objectNumber + generationNumber）であり、type=2 のオブジェクトは常に generationNumber=0 で格納・照会する。

### LRUキャッシュ

| 項目 | 仕様 |
|:-----|:-----|
| デフォルト容量 | 1024エントリ |
| 追い出し戦略 | LRU（最も古い使用のエントリから） |
| キー | `ObjectId` (objectNumber + generationNumber) |
| スレッドセーフ | 不要（シングルスレッド前提） |
| 容量設定 | `LoadOptions.cacheCapacity` で変更可能 |

> **既知の制約**: 上限は**エントリ数**でありバイト量ではない。大きなストリームオブジェクトを多数キャッシュすると、エントリ数上限内でもメモリを大量消費しうる（index.md の非機能要件「入力サイズの2倍以内」はこの経路では保証されない）。バイト量ベースの上限は本仕様では規定しない。

### ObjectStreamExtractor

**入力**: `ObjectResolver` + ストリームオブジェクト番号 + インデックス
**出力**: `PdfObject`

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| OS-001 | ストリーム解決 | 親ストリームオブジェクトをresolve | ストリームデータを展開 |
| OS-002 | /First 取得 | ストリーム辞書の `/First` | オブジェクトデータ開始オフセット |
| OS-003 | /N 取得 | ストリーム辞書の `/N` | 格納されたオブジェクト数 |
| OS-004 | ヘッダパース | オフセットテーブル（objNum offset ペア） | インデックスに対応するオフセットを特定 |
| OS-005 | オブジェクト抽出 | 特定オフセットからObjectParser | 対象オブジェクトをパース |
| OS-006 | ストリームキャッシュ | 同一ストリームの複数アクセス | 展開済みストリームデータをキャッシュ |

## ファイル配置

```
packages/core/src/
├── objects/
│   ├── index.ts                  # 再エクスポート
│   ├── types.ts                  # PdfObject, ObjectId
│   ├── object-parser.ts          # ObjectParser
│   ├── object-resolver.ts        # ObjectResolver
│   ├── object-stream-extractor.ts # ObjectStreamExtractor
│   └── lru-cache.ts              # LRUCache<K, V>
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) - ObjectResolverが使用するxrefテーブルを提供
- [page-tree-spec.md](./page-tree-spec.md) - ObjectResolverを使ってページツリーを走査
- [error-handling-spec.md](./error-handling-spec.md) - PdfCircularReferenceError, PdfTypeMismatchError
- `docs/specs/01_lexical_conventions.md` - 9つのプリミティブ型の仕様
