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

**説明**: PDFバイナリデータを解析し、ドキュメント構造を構築する。

**入力**: PDFバイナリ（バイト列）と省略可能な `LoadOptions`。

**出力**: 非同期に `Result` を返す。成功時は `PdfDocument`、失敗時は `PdfDocumentLoadError`（`PdfError` または `RangeError`）を `Err` で返し、Promise は reject しない。

**パラメータ**:

| パラメータ | 型 | 必須 | 説明 |
|:----------|:---|:-----|:-----|
| `data` | バイト列 | はい | PDFファイルのバイナリデータ |
| `options` | `LoadOptions` | いいえ | 解析オプション |

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

すべてのフィールドは省略可能。

| フィールド | 型 | デフォルト | 説明 |
|:----------|:---|:----------|:-----|
| `cacheCapacity` | 整数 | 1024 | オブジェクト（LRU）キャッシュの最大エントリ数 |
| `onWarning` | コールバック（`PdfWarning` を受け取る） | 未設定 | 寛容処理で回復した際の警告コールバック |

### PdfDocument

プロパティはすべて読み取り専用。

| メソッド/プロパティ | 型 | 説明 |
|:----------|:---|:-----|
| `version` | 文字列 | PDFバージョン（例: "1.7", "2.0"）。ヘッダとカタログ`/Version`の大きい方 |
| `pageCount` | 整数 | ページツリー走査で確定した総ページ数 |
| `metadata` | `DocumentMetadata` | タイトル、作成者等のメタ情報 |
| `getPage(index)` | `Option<ResolvedPage>` | 0始まりのインデックスでページ取得 |
| `resolver` | `ObjectStore` | 内部のオブジェクトストアへのアクセス（上級者向け・拡張用途） |

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| DA-001 | getPage範囲外 | index < 0、index >= pageCount、または非整数 | `None` を返却 |
| DA-002 | getPage範囲内 | 0 <= index < pageCount の整数 | `Some<ResolvedPage>` を返却 |

> **注**: 値の有無だけを表せばよくエラー情報が不要なため、Result ではなく Option で表現する（プロジェクト規約「Result / Option の使い分け」参照）。

### PdfPage

プロパティはすべて読み取り専用。

| プロパティ | 型 | 説明 |
|:----------|:---|:-----|
| `mediaBox` | 数値4つ組 `[llx, lly, urx, ury]` | ページの物理的寸法（ポイント単位） |
| `cropBox` | 数値4つ組 `[llx, lly, urx, ury]` | トリミング領域 |
| `width` | 数値 | ページ幅（ポイント単位、Rotateを考慮） |
| `height` | 数値 | ページ高さ（ポイント単位、Rotateを考慮） |
| `rotate` | 0 / 90 / 180 / 270 のいずれか | 回転角度 |
| `userUnit` | 数値 | ユーザー空間の単位倍率 |
| `ref` | `IndirectRef` | このページのオブジェクト参照 |

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| PP-001 | width/height算出 | Rotate = 0 or 180 | width = urx - llx, height = ury - lly |
| PP-002 | width/height算出 | Rotate = 90 or 270 | width = ury - lly, height = urx - llx |
| PP-003 | userUnit適用 | userUnit != 1.0 | width/heightにuserUnitを乗算 |

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
