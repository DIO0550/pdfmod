# PDF解析パイプライン - ページツリー走査仕様

> **上位目次**: [PDF解析パイプライン仕様](./index.md)  
> **関連仕様**: [03. 論理ドキュメントアーキテクチャ](../specs/03_document_architecture.md) / [パブリック API 仕様](./document-api-spec.md)  
> **図解ガイド**: [ドキュメントカタログ](../guides/document-catalog.html) / [ページツリーと属性継承](../guides/page-tree.html) / [ドキュメント情報辞書](../guides/document-info.html) / [日付文字列](../guides/date-format.html)

## 概要

カタログ辞書（`/Root`）からページツリーを走査し、全ページの属性を継承解決済みの状態で構築します。`/Pages`（中間ノード）と `/Page`（末端ノード）の階層を辿り、`/MediaBox`・`/Resources`・`/CropBox`・`/Rotate` の 4 属性を親から子へ継承します。

## モジュール構成

| モジュール | 責務 |
| :--- | :--- |
| `CatalogParser` | トレイラの `/Root` からカタログ辞書を解析 |
| `PageTreeWalker` | `/Pages` ツリーを走査し `ResolvedPage[]` を構築 |
| `InheritanceResolver` | ページ属性の親 → 子継承を解決 |
| `DocumentInfoParser` | `/Info` 辞書からメタデータを抽出 |

---

## データ型

### `ResolvedPage`

継承解決済みのページ 1 枚分の属性セットです。

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `mediaBox` | 矩形 `[llx, lly, urx, ury]` | 物理寸法（ポイント単位）。左下・右上の順に正規化済み（IH-006） |
| `resources` | 辞書 | 描画リソース辞書 |
| `cropBox` | 矩形 `[llx, lly, urx, ury]` | トリミング領域（未指定時は `mediaBox` と同一）。正規化済み（IH-006） |
| `rotate` | `0 \| 90 \| 180 \| 270` | 表示時の回転角度 |
| `contents` | `Option<間接参照 \| 間接参照の配列>` | コンテンツストリーム参照。`/Contents` 不在・不正時は `None` |
| `annots` | `Option<PdfObject[]>` | アノテーション配列。`/Annots` 不在・非配列時は `None` |
| `userUnit` | 実数 | ユーザー空間の単位倍率（既定値 `1.0`） |
| `objectRef` | 間接参照 | 元のページオブジェクト参照 |

### `DocumentMetadata`

ドキュメントのメタデータです。`version` 以外のフィールドはすべて省略可能です。

| フィールド | 型 | 説明 |
| :--- | :--- | :--- |
| `version` | 文字列 | PDF バージョン（ヘッダとカタログ `/Version` の新しい方） |
| `title` / `author` / `subject` / `keywords` | 文字列 | 文書のタイトル・作成者・主題・キーワード |
| `creator` / `producer` | 文字列 | 元アプリ名 / PDF 変換アプリ名 |
| `creationDate` / `modDate` | 日時 | 作成日時 / 最終更新日時 |
| `pageLayout` / `pageMode` | 文字列 | ページレイアウトモード / 表示モード |

---

## 処理仕様

### 1. `CatalogParser`

- **入力**: `TrailerDict` + `ObjectResolver`
- **出力**: カタログ辞書（`PdfDictionary`）+ PDF バージョン

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| CT-001 | `/Root` 解決 | トレイラの `/Root` を解決 | `ObjectResolver` で間接参照を解決 |
| CT-002 | `/Type` 検証 | カタログ辞書の `/Type` | `/Catalog` であることを確認 |
| CT-003 | `/Pages` 取得 | カタログの `/Pages` | ページツリーのルートノード参照を取得 |
| CT-004 | `/Version` 上書き | カタログの `/Version` がヘッダより新しい | カタログのバージョンを採用 |
| CT-005 | `/Version` 維持 | カタログの `/Version` が未定義またはヘッダ以下 | ヘッダのバージョンを使用 |

### 2. `PageTreeWalker`

- **入力**: ページツリーのルートノード + `ObjectResolver`
- **出力**: `ResolvedPage[]`

```text
walkPageTree(node, inheritedAttrs, visited)
  ├─ visited に node.id が既に存在 → 循環参照検出、スキップ + 警告
  ├─ /Type === /Pages
  │    ├─ このノードの継承可能属性を inheritedAttrs へ反映
  │    └─ /Kids の各子ノードを順に走査
  └─ /Type === /Page
       ├─ InheritanceResolver で属性解決
       └─ ResolvedPage を生成して結果へ追加
```

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| PW-001 | `/Type` 判定（中間） | `/Pages` | 中間ノードとして `/Kids` を再帰走査 |
| PW-002 | `/Type` 判定（末端） | `/Page` | 末端ノードとして `ResolvedPage` を生成 |
| PW-003 | `/Type` 不明 | `/Pages` でも `/Page` でもない | 警告を通知してスキップ |
| PW-004 | 循環参照 | `visited` に既存の `ObjectId` | スキップ + 警告通知 |
| PW-005 | `/Kids` 不在 | `/Pages` ノードに `/Kids` がない | 空配列として扱い警告 |
| PW-006 | `/Count` 不一致 | `/Count` と実際のページ数が異なる | 実際のページ数を使用 + 警告 |
| PW-007 | 深度制限 | ツリー深度が 50 を超える | 走査を打ち切り + 警告 |

### 3. `InheritanceResolver`

- **入力**: ページオブジェクト + 親から伝播された属性
- **出力**: 解決済みの属性セット

| 継承可能な属性 | 型 | 既定値 | 備考 |
| :--- | :--- | :--- | :--- |
| `/MediaBox` | `[number, number, number, number]` | なし（必須） | ルートまで未定義ならエラー |
| `/Resources` | `PdfDictionary` | 空辞書 | 編集時のシャドウイングに注意（[03章 §4.2](../specs/03_document_architecture.md#42-継承メカニズムの落とし穴)） |
| `/CropBox` | `[number, number, number, number]` | `MediaBox` と同一 | — |
| `/Rotate` | `number` | `0` | `0`, `90`, `180`, `270` のみ有効 |

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| IH-001 | ページ直接定義優先 | ページに属性が直接定義 | 継承値ではなくページの値を使用 |
| IH-002 | 親から継承 | ページに未定義、親に存在 | 親の値を継承（ルート方向へ辿る） |
| IH-003 | `MediaBox` 必須 | ルートまで辿っても未定義 | `MEDIABOX_NOT_FOUND` エラーを返す |
| IH-004 | `Rotate` 正規化 | `0 / 90 / 180 / 270` 以外の値 | 90 の倍数へ丸める（寛容処理） |
| IH-005 | `CropBox` 既定値 | `CropBox` 未定義 | `MediaBox` と同一値を設定 |
| IH-006 | 矩形正規化 | `MediaBox` / `CropBox` が対角逆順（例: `[612 792 0 0]`） | `PdfRectangle.normalize` で各軸の min / max を取り `[llx, lly, urx, ury]` へ並べ替え（ISO 32000-1 §7.9.5、警告なし。幅・高さ 0 の退化矩形も受理） |

### 4. `DocumentInfoParser`

- **入力**: `TrailerDict` + `ObjectResolver`
- **出力**: `DocumentMetadata`

| ID | ルール | 条件 | 振る舞い |
| :--- | :--- | :--- | :--- |
| DI-001 | `/Info` 解決 | トレイラの `/Info` が存在 | `ObjectResolver` で解決して辞書をパース |
| DI-002 | `/Info` 不在 | トレイラに `/Info` がない | 空の `DocumentMetadata` を返却 |
| DI-003 | 日時パース | `D:YYYYMMDDHHmmSSOHH'mm'` 形式 | 日時へ変換（年以降の階層的省略・ISO 32000-2 の末尾 `'` 省略を受理） |
| DI-004 | 日時不正 | パースできない日時文字列 | 未設定（`undefined`）にし、警告を通知 |

```text
D:YYYYMMDDHHmmSSOHH'mm'
  │   │ │ │ │ │ ││  └─ UTC オフセット分
  │   │ │ │ │ │ │└──── UTC オフセット時
  │   │ │ │ │ │ └───── UTC 関係: + / - / Z
  │   │ │ │ │ └─────── 秒 (省略時 00)
  │   │ │ │ └───────── 分 (省略時 00)
  │   │ │ └─────────── 時 (省略時 00)
  │   │ └───────────── 日 (省略時 01)
  │   └─────────────── 月 (省略時 01)
  └─────────────────── 年 (4 桁、必須)
```

---

## ファイル配置

```text
packages/core/src/document/
├── index.ts                              # 再エクスポート
├── catalog/
│   └── catalog-parser/index.ts           # CatalogParser
├── date/
│   └── pdf-date/index.ts                 # PDF 日時文字列パーサ
├── encoding/                             # テキスト文字列デコード（PDFDocEncoding / UTF-16BE / UTF-8）
├── metadata/
│   ├── document-info-parser/index.ts     # DocumentInfoParser
│   └── document-metadata/index.ts        # DocumentMetadata
└── page-tree/
    ├── page-tree-walker/index.ts         # PageTreeWalker
    ├── inheritance-resolver/index.ts     # InheritanceResolver
    └── resolved-page/index.ts            # ResolvedPage / PdfRectangle
```

## 関連仕様

- [object-resolver-spec.md](./object-resolver-spec.md) — ページツリー走査で間接参照を解決
- [document-api-spec.md](./document-api-spec.md) — `ResolvedPage` を `PdfPage` にラップ
- [error-handling-spec.md](./error-handling-spec.md) — 継承解決失敗時のエラー・警告コード
- [03. 論理ドキュメントアーキテクチャ](../specs/03_document_architecture.md) — ISO 32000 ページツリー・ボックスモデル詳細
