# PDF解析パイプライン - パブリックAPI仕様

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## 概要

`@pdfmod/core` パッケージのエントリーポイントとなるパブリックAPI。`PdfDocument` と `PdfPage` クラスを提供し、内部のパイプラインモジュール（xref解析・オブジェクト解決・ページツリー走査）を隠蔽する。

## API一覧

| クラス/関数 | 説明 |
|:-----------|:-----|
| `PdfDocument.load()` | PDFバイナリからドキュメントを構築（非同期） |
| `PdfDocument` | ドキュメント全体を表すクラス |
| `PdfPage` | 1ページを表すクラス |
| `LoadOptions` | 読み込みオプション |

## API詳細

### PdfDocument.load()

```typescript
static async load(
  data: Uint8Array,
  options?: LoadOptions
): Promise<PdfDocument>
```

**説明**: PDFバイナリデータを解析し、ドキュメント構造を構築する。

**パラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| `data` | `Uint8Array` | はい | PDFファイルのバイナリデータ |
| `options` | `LoadOptions` | いいえ | 解析オプション |

**戻り値**: `Promise<PdfDocument>`

**エラー**:

| エラー | 発生条件 |
|:-------|:---------|
| `PdfParseError` | ヘッダが`%PDF-`で始まらない |
| `PdfParseError` | startxrefが検出できない |
| `PdfParseError` | `/Root`（カタログ）が解決できない |
| `PdfParseError` | MediaBoxがどのページにも存在しない |

### LoadOptions

```typescript
interface LoadOptions {
  /** LRUキャッシュのエントリ数上限（デフォルト: 1024） */
  cacheCapacity?: number;
  /** パースの警告をコールバックで受け取る */
  onWarning?: (warning: PdfWarning) => void;
}
```

| フィールド | 型 | デフォルト | 説明 |
|:----------|:---|:----------|:-----|
| `cacheCapacity` | `number` | 1024 | オブジェクトキャッシュの最大エントリ数 |
| `onWarning` | `(warning) => void` | undefined | 寛容処理で回復した際の警告コールバック |

### PdfDocument

```typescript
class PdfDocument {
  /** PDFバージョン（例: "1.7", "2.0"） */
  readonly version: string;

  /** 総ページ数 */
  readonly pageCount: number;

  /** ドキュメントメタデータ */
  readonly metadata: DocumentMetadata;

  /** 指定インデックスのページを取得（0始まり） */
  getPage(index: number): PdfPage;

  /** 内部のObjectResolverへのアクセス（上級者向け） */
  readonly resolver: ObjectResolver;
}
```

| メソッド/プロパティ | 型 | 説明 |
|:----------|:---|:-----|
| `version` | `string` | ヘッダとカタログ`/Version`の大きい方 |
| `pageCount` | `number` | ページツリー走査で確定したページ数 |
| `metadata` | `DocumentMetadata` | タイトル、作成者等のメタ情報 |
| `getPage(index)` | `PdfPage` | 0始まりのインデックスでページ取得 |
| `resolver` | `ObjectResolver` | 内部リゾルバ（拡張用途） |

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| DA-001 | getPage範囲外 | index < 0 または index >= pageCount | `RangeError` をスロー |
| DA-002 | getPage遅延構築 | 初回アクセス時 | ResolvedPageからPdfPageインスタンスを生成 |

### PdfPage

```typescript
class PdfPage {
  /** ページの物理的寸法 [llx, lly, urx, ury]（ポイント単位） */
  readonly mediaBox: readonly [number, number, number, number];

  /** トリミング領域 */
  readonly cropBox: readonly [number, number, number, number];

  /** ページ幅（ポイント単位、Rotateを考慮） */
  readonly width: number;

  /** ページ高さ（ポイント単位、Rotateを考慮） */
  readonly height: number;

  /** 回転角度 */
  readonly rotate: 0 | 90 | 180 | 270;

  /** ユーザー空間の単位倍率 */
  readonly userUnit: number;

  /** このページのオブジェクト参照 */
  readonly ref: IndirectRef;
}
```

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| PP-001 | width/height算出 | Rotate = 0 or 180 | width = urx - llx, height = ury - lly |
| PP-002 | width/height算出 | Rotate = 90 or 270 | width = ury - lly, height = urx - llx |
| PP-003 | userUnit適用 | userUnit != 1.0 | width/heightにuserUnitを乗算 |

## パッケージエクスポート

```typescript
// packages/core/src/index.ts

// 既存エクスポート
export { Tokenizer } from "./lexer/index.js";
export { TokenType } from "./types/index.js";
export type { Token, IndirectRef } from "./types/index.js";

// Phase 1+2 で追加するエクスポート
export { PdfDocument } from "./document/index.js";
export { PdfPage } from "./document/index.js";
export type {
  LoadOptions,
  DocumentMetadata,
  ResolvedPage,
  PdfObject,
  XRefEntry,
  XRefTable,
} from "./types/index.js";

// エラークラス
export {
  PdfParseError,
  CircularReferenceError,
  PdfTypeError,
} from "./errors/index.js";
```

## 使用例

```typescript
import { PdfDocument } from "@pdfmod/core";

// ファイル読み込み
const response = await fetch("/sample.pdf");
const data = new Uint8Array(await response.arrayBuffer());

// ドキュメント解析
const doc = await PdfDocument.load(data, {
  onWarning: (w) => console.warn(`PDF warning: ${w.message}`),
});

console.log(`Version: ${doc.version}`);
console.log(`Pages: ${doc.pageCount}`);
console.log(`Title: ${doc.metadata.title}`);

// ページ情報
for (let i = 0; i < doc.pageCount; i++) {
  const page = doc.getPage(i);
  console.log(`Page ${i + 1}: ${page.width} x ${page.height} pt`);
}
```

## ファイル配置

```
packages/core/src/
├── index.ts                    # パッケージエントリーポイント（エクスポート更新）
├── document/
│   ├── index.ts                # PdfDocument, PdfPage 再エクスポート
│   ├── pdf-document.ts         # PdfDocument クラス
│   └── pdf-page.ts             # PdfPage クラス
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) - PdfDocument.load() 内部で使用
- [object-resolver-spec.md](./object-resolver-spec.md) - PdfDocument.load() 内部で使用
- [page-tree-spec.md](./page-tree-spec.md) - PdfDocument.load() 内部で使用
- [error-handling-spec.md](./error-handling-spec.md) - エラークラス定義
