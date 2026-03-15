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

### PdfObject（共用体型）

```typescript
type PdfObject =
  | { type: "null" }
  | { type: "boolean"; value: boolean }
  | { type: "integer"; value: number }
  | { type: "real"; value: number }
  | { type: "string"; value: Uint8Array; encoding: "literal" | "hex" }
  | { type: "name"; value: string }
  | { type: "array"; elements: PdfObject[] }
  | { type: "dictionary"; entries: Map<string, PdfObject> }
  | { type: "stream"; dictionary: PdfDictionary; data: Uint8Array }
  | { type: "indirect-ref"; objectNumber: number; generationNumber: number };
```

### ObjectId

```typescript
interface ObjectId {
  objectNumber: number;
  generationNumber: number;
}
```

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
| OP-009 | ネスト深度制限 | 配列/辞書のネストが100段超 | `PdfParseError` をスロー（DoS防止） |

### ObjectResolver

**入力**: `XRefTable` + `Uint8Array`（PDFバイナリ）
**出力**: `PdfObject`（解決済み）

```typescript
class ObjectResolver {
  resolve(ref: IndirectRef): PdfObject;
  resolveAs<T extends PdfObject["type"]>(ref: IndirectRef, expectedType: T): Extract<PdfObject, { type: T }>;
}
```

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
│ resolving Set    │──────────▶ CircularReferenceError
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
| OR-002 | 循環参照検出 | resolving Set に既に存在 | `CircularReferenceError` をスロー |
| OR-003 | xref未登録 | オブジェクト番号がxrefに存在しない | PdfNull `{ type: "null" }` を返却 |
| OR-004 | 通常オブジェクト | XRefEntry.type = 1 | field2のオフセットにseek → パース |
| OR-005 | オブジェクトストリーム | XRefEntry.type = 2 | ObjectStreamExtractorで抽出 |
| OR-006 | xrefオフセットずれ | 指定オフセットに`obj`キーワードがない | 前後32バイト範囲で `N G obj` パターンを探索（寛容処理） |
| OR-007 | 型チェック | resolveAs() で期待型と不一致 | `PdfTypeError` をスロー |

### LRUキャッシュ

| 項目 | 仕様 |
|:-----|:-----|
| デフォルト容量 | 1024エントリ |
| 追い出し戦略 | LRU（最も古い使用のエントリから） |
| キー | `ObjectId` (objectNumber + generationNumber) |
| スレッドセーフ | 不要（シングルスレッド前提） |
| 容量設定 | `LoadOptions.cacheCapacity` で変更可能 |

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
- [error-handling-spec.md](./error-handling-spec.md) - CircularReferenceError, PdfTypeError
- `docs/specs/01_lexical_conventions.md` - 9つのプリミティブ型の仕様
