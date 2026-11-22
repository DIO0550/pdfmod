# PDF解析パイプライン - パブリックAPI仕様

> **上位目次**: [PDF解析パイプライン仕様](./index.md)  
> **関連仕様**: [ページツリー仕様](./page-tree-spec.md) / [エラーハンドリング仕様](./error-handling-spec.md) / [03. 論理ドキュメントアーキテクチャ](../specs/03_document_architecture.md)  
> **図解ガイド**: [文書からページへ](../guides/document-api.html)

## 概要

`@pdfmod/core` パッケージのエントリーポイントとなるパブリック API を定義します。`PdfDocument` と `PdfPage` を提供し、内部パイプライン（xref 解析・オブジェクト解決・ページツリー走査）を隠蔽します。

## API 一覧

| クラス / 型 | 説明 |
| :--- | :--- |
| `PdfDocument.load()` | PDF バイナリからドキュメント構造を非同期に構築する |
| `PdfDocument` | ドキュメント全体を表すハンドル |
| `PdfPage` | 継承解決済みの 1 ページを表すオブジェクト |
| `LoadOptions` | 読み込み時の設定オプション |

---

## API 詳細

### `PdfDocument.load(data, options?)`

PDF バイナリデータを解析し、ドキュメント構造を構築します。

- **戻り値**: `Promise<Result<PdfDocument, PdfDocumentLoadError>>`（`PdfDocumentLoadError = PdfError | RangeError`）
- **失敗の扱い**: **PDF データ起因の失敗で Promise を reject することはありません**（呼び出し側は `result.ok` で分岐する）。ただし利用者が渡した `onWarning` コールバック自身が例外を投げた場合は、変換されずにそのまま伝播します。

#### パラメータ

| パラメータ | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `data` | バイト列（`Uint8Array`） | はい | PDF ファイルのバイナリデータ |
| `options` | `LoadOptions` | いいえ | 解析オプション |

#### 代表的なエラー

全エラーコードの正本は [error-handling-spec.md](./error-handling-spec.md) を参照してください。

| エラー | 発生条件 |
| :--- | :--- |
| `PdfParseError` (`INVALID_HEADER`) | ヘッダが `%PDF-` で始まらない |
| `PdfParseError` (`STARTXREF_NOT_FOUND`) | `startxref` が検出できない |
| `PdfParseError` (`ENCRYPTED_PDF_UNSUPPORTED`) | トレイラに `/Encrypt` が存在する（暗号化 PDF 未対応） |
| `PdfParseError` (`ROOT_NOT_FOUND`) | トレイラに `/Root` が存在しない（フォールバック再構成でも得られない）。`/Root` の解決・検証失敗時は `CATALOG_ROOT_NOT_DICTIONARY` / `CATALOG_TYPE_INVALID` / `TYPE_MISMATCH` / `CIRCULAR_REFERENCE` 等を返す |
| `PdfParseError` (`MEDIABOX_NOT_FOUND`) | ルートまで辿っても `/MediaBox` が定義されていないページがある |
| `RangeError` | `LoadOptions.cacheCapacity` が不正（0 以下・非整数・`NaN` 等）。throw せず `Err` で返す |

---

### `LoadOptions`

すべてのフィールドは省略可能です。

| フィールド | 型 | 既定値 | 説明 |
| :--- | :--- | :--- | :--- |
| `cacheCapacity` | 整数 | `1024` | オブジェクト（LRU）キャッシュの最大エントリ数 |
| `onWarning` | `(warning: PdfWarning) => void` | 未設定 | 寛容処理で回復した際の警告コールバック |

---

### `PdfDocument`

プロパティはすべて読み取り専用です。

| メソッド / プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `version` | 文字列 | PDF バージョン（例: `"1.7"`, `"2.0"`）。ヘッダとカタログ `/Version` の新しい方 |
| `pageCount` | 整数 | ページツリー走査で確定した総ページ数 |
| `metadata` | `DocumentMetadata` | タイトル・作成者・作成日時などのメタ情報 |
| `getPage(index)` | `Option<ResolvedPage>` | 0 始まりのインデックスでページを取得する |
| `resolver` | `ObjectStore` | 内部のオブジェクトストアへのアクセス（拡張用途向け） |

#### ルール（`getPage`）

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| DA-001 | `getPage` 範囲外 | `index < 0`、`index >= pageCount`、または非整数 | `None` を返却 |
| DA-002 | `getPage` 範囲内 | `0 <= index < pageCount` の整数 | `Some<ResolvedPage>` を返却 |

> 値の有無だけを表せばよくエラー情報が不要なため、`Result` ではなく `Option` を返します（`rules/coding.md` の Result / Option 使い分けに準拠）。

---

### `PdfPage`

プロパティはすべて読み取り専用です。

| プロパティ | 型 | 説明 |
| :--- | :--- | :--- |
| `mediaBox` | 数値 4 つ組 `[llx, lly, urx, ury]` | ページの物理的寸法（ポイント単位） |
| `cropBox` | 数値 4 つ組 `[llx, lly, urx, ury]` | トリミング領域 |
| `width` | 数値 | ページ幅（ポイント単位、`rotate` と `userUnit` を反映） |
| `height` | 数値 | ページ高さ（ポイント単位、`rotate` と `userUnit` を反映） |
| `rotate` | `0 \| 90 \| 180 \| 270` | 回転角度 |
| `userUnit` | 数値 | ユーザー空間の単位倍率 |
| `ref` | `IndirectRef` | このページのオブジェクト参照 |

#### ルール（寸法算出）

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| PP-001 | `width` / `height` 算出（正立・180°） | `rotate` が `0` または `180` | `width = urx - llx`, `height = ury - lly` |
| PP-002 | `width` / `height` 算出（90°・270°） | `rotate` が `90` または `270` | `width = ury - lly`, `height = urx - llx` |
| PP-003 | `userUnit` 適用 | `userUnit != 1.0` | `width` と `height` に `userUnit` を乗算 |

---

## ファイル配置

```text
packages/core/src/
├── index.ts                      # パッケージエントリーポイント
└── document/
    ├── index.ts                  # PdfDocument, PdfPage 再エクスポート
    ├── pdf-document/index.ts     # PdfDocument クラス
    └── pdf-page/index.ts         # PdfPage クラス
```

## 関連仕様

- [xref-parser-spec.md](./xref-parser-spec.md) — `PdfDocument.load()` 内部での xref 解析
- [object-resolver-spec.md](./object-resolver-spec.md) — `PdfDocument.load()` 内部でのオブジェクト解決
- [page-tree-spec.md](./page-tree-spec.md) — ページツリー走査・属性継承
- [error-handling-spec.md](./error-handling-spec.md) — エラー・警告コード正本
