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
): Promise<Result<PdfDocument, PdfDocumentLoadError>>

type PdfDocumentLoadError = PdfError | RangeError;
```

**説明**: PDFバイナリデータを解析し、ドキュメント構造を構築する。

**パラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| `data` | `Uint8Array` | はい | PDFファイルのバイナリデータ |
| `options` | `LoadOptions` | いいえ | 解析オプション |

**戻り値**: `Promise<Result<PdfDocument, PdfDocumentLoadError>>`

**エラー**:

`load()` は Promise を reject せず、失敗を `Err<PdfDocumentLoadError>` として返す（`PdfError` は [error-handling-spec.md](./error-handling-spec.md) 参照）。呼び出し側は `result.ok` で分岐する。

| エラー | 発生条件 |
|:-------|:---------|
| `PdfParseError` (`INVALID_HEADER`) | ヘッダが`%PDF-`で始まらない |
| `PdfParseError` (`STARTXREF_NOT_FOUND`) | startxrefが検出できない |
| `PdfParseError` (`ENCRYPTED_PDF_UNSUPPORTED`) | trailerに`/Encrypt`が存在する（暗号化PDF未対応） |
| `PdfParseError` (`ROOT_NOT_FOUND`) | `/Root`（カタログ）が解決できない |
| `PdfParseError` (`MEDIABOX_NOT_FOUND`) | MediaBoxがどのページにも存在しない |
| `RangeError` | `LoadOptions.cacheCapacity` が不正（0以下・非整数・NaN 等）。プログラマエラーだが throw ではなく `Err` で返す |

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
  getPage(index: number): Option<ResolvedPage>;

  /** 内部のオブジェクトストアへのアクセス（上級者向け） */
  readonly resolver: ObjectStore;
}
```

| メソッド/プロパティ | 型 | 説明 |
|:----------|:---|:-----|
| `version` | `string` | ヘッダとカタログ`/Version`の大きい方 |
| `pageCount` | `number` | ページツリー走査で確定したページ数 |
| `metadata` | `DocumentMetadata` | タイトル、作成者等のメタ情報 |
| `getPage(index)` | `Option<ResolvedPage>` | 0始まりのインデックスでページ取得 |
| `resolver` | `ObjectStore` | 内部のオブジェクトストア（拡張用途） |

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| DA-001 | getPage範囲外 | index < 0、index >= pageCount、または非整数 | `None` を返却 |
| DA-002 | getPage範囲内 | 0 <= index < pageCount の整数 | `Some<ResolvedPage>` を返却 |

> **注**: 値の有無だけを表せばよくエラー情報が不要なため、Result ではなく Option で表現する（プロジェクト規約「Result / Option の使い分け」参照）。

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
// packages/core/src/index.ts（本仕様に関係する部分の抜粋）

// ドキュメントAPI
export { PdfDocument, PdfPage } from "./document/index";
export type {
  LoadOptions,
  DocumentMetadata,
  ResolvedPage,
  PdfDocumentLoadError,
} from "./document/index";

// PDF基盤型・エラー型（interface — Result の error として返却される。クラスではないため type export）
export type {
  PdfObject,
  XRefEntry,
  XRefTable,
  PdfError,
  PdfParseError,
  PdfCircularReferenceError,
  PdfTypeMismatchError,
  PdfWarning,
} from "./pdf/index";
```

## 使用例

```typescript
import { PdfDocument } from "@pdfmod/core";

// ファイル読み込み
const response = await fetch("/sample.pdf");
const data = new Uint8Array(await response.arrayBuffer());

// ドキュメント解析
const result = await PdfDocument.load(data, {
  onWarning: (w) => console.warn(`PDF warning: ${w.message}`),
});
if (!result.ok) {
  console.error(result.error);
  return;
}
const doc = result.value;

console.log(`Version: ${doc.version}`);
console.log(`Pages: ${doc.pageCount}`);
console.log(`Title: ${doc.metadata.title}`);

// ページ情報
for (let i = 0; i < doc.pageCount; i++) {
  const page = doc.getPage(i);
  if (page.some) {
    const [llx, lly, urx, ury] = page.value.mediaBox;
    console.log(`Page ${i + 1}: ${urx - llx} x ${ury - lly} pt`);
  }
}
```

## ファイル配置

```
packages/core/src/
├── index.ts                    # パッケージエントリーポイント
├── document/
│   ├── index.ts                # PdfDocument, PdfPage 再エクスポート
│   ├── pdf-document/index.ts   # PdfDocument クラス
│   └── pdf-page/index.ts       # PdfPage クラス
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) - PdfDocument.load() 内部で使用
- [object-resolver-spec.md](./object-resolver-spec.md) - PdfDocument.load() 内部で使用
- [page-tree-spec.md](./page-tree-spec.md) - PdfDocument.load() 内部で使用
- [error-handling-spec.md](./error-handling-spec.md) - エラー型定義
