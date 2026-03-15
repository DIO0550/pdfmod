# PDF解析パイプライン - ページツリー走査仕様

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## 概要

カタログ辞書（`/Root`）からページツリーを再帰的に走査し、全ページの属性を継承解決済みの状態で構築する。`/Pages`（中間ノード）と`/Page`（末端ノード）のツリー構造を辿り、MediaBox / Resources / CropBox / Rotate の4属性を親ノードから子ノードへ継承する。

## モジュール構成

| モジュール | 責務 |
|:-----------|:-----|
| `CatalogParser` | トレイラの`/Root`からカタログ辞書を解析 |
| `PageTreeWalker` | `/Pages`ツリーを再帰走査し`ResolvedPage[]`を構築 |
| `InheritanceResolver` | ページ属性の親→子継承を解決 |
| `DocumentInfoParser` | `/Info`辞書からメタデータを抽出 |

## データ型

### ResolvedPage

```typescript
interface ResolvedPage {
  /** ページの物理的寸法 [llx, lly, urx, ury]（ポイント単位） */
  mediaBox: [number, number, number, number];
  /** 描画リソース辞書 */
  resources: PdfDictionary;
  /** トリミング領域（未指定時はmediaBoxと同一） */
  cropBox: [number, number, number, number];
  /** 表示時の回転角度 */
  rotate: 0 | 90 | 180 | 270;
  /** コンテンツストリームへの参照 */
  contents: IndirectRef | IndirectRef[] | null;
  /** アノテーション配列 */
  annots: PdfObject[] | null;
  /** ユーザー空間の単位倍率（デフォルト1.0） */
  userUnit: number;
  /** 元のページオブジェクトの参照 */
  objectRef: IndirectRef;
}
```

### DocumentMetadata

```typescript
interface DocumentMetadata {
  /** PDFバージョン（ヘッダとカタログの/Versionを比較し大きい方） */
  version: string;
  /** ドキュメントタイトル */
  title?: string;
  /** 作成者 */
  author?: string;
  /** 主題 */
  subject?: string;
  /** キーワード */
  keywords?: string;
  /** 作成アプリケーション名 */
  creator?: string;
  /** PDF変換アプリケーション名 */
  producer?: string;
  /** 作成日時 */
  creationDate?: Date;
  /** 最終更新日時 */
  modDate?: Date;
  /** ページレイアウトモード */
  pageLayout?: string;
  /** 表示モード */
  pageMode?: string;
}
```

## 処理仕様

### CatalogParser

**入力**: `TrailerDict` + `ObjectResolver`
**出力**: カタログ辞書（PdfDictionary）+ PDFバージョン

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| CT-001 | /Root解決 | トレイラの`/Root`を解決 | ObjectResolverで間接参照を解決 |
| CT-002 | /Type検証 | カタログ辞書の`/Type` | `/Catalog` であることを確認 |
| CT-003 | /Pages取得 | カタログの`/Pages` | ページツリーのルートノード参照を取得 |
| CT-004 | /Version | カタログの`/Version`がヘッダより新しい | カタログのバージョンを採用 |
| CT-005 | /Version | カタログの`/Version`が未定義 or ヘッダ以下 | ヘッダのバージョンを使用 |

### PageTreeWalker

**入力**: ページツリーのルートノード + `ObjectResolver`
**出力**: `ResolvedPage[]`

#### 走査アルゴリズム

```
walkPageTree(node, inheritedAttrs, visited)
    │
    ├── visited に node.id 追加
    │   └── 既に存在 → 循環参照検出、スキップ + 警告
    │
    ├── node./Type === "/Pages" の場合
    │   ├── このノードの継承可能属性を inheritedAttrs にマージ
    │   └── /Kids の各子ノードで walkPageTree を再帰呼び出し
    │
    └── node./Type === "/Page" の場合
        ├── InheritanceResolver で属性解決
        └── ResolvedPage を生成してリストに追加
```

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| PW-001 | /Type判定 | `/Pages` | 中間ノードとして`/Kids`を再帰走査 |
| PW-002 | /Type判定 | `/Page` | 末端ノードとしてResolvedPageを生成 |
| PW-003 | /Type不明 | `/Pages`でも`/Page`でもない | 警告ログを出力し、スキップ |
| PW-004 | 循環参照 | visited Set に既存のObjectId | スキップ + `warn`レベルログ |
| PW-005 | /Kids不在 | `/Pages`ノードに`/Kids`がない | 空配列として扱い、警告 |
| PW-006 | /Count不一致 | `/Count`と実際のページ数が異なる | 実際のページ数を使用、警告 |
| PW-007 | 深度制限 | ツリー深度が50を超える | 走査停止 + 警告 |

### InheritanceResolver

**入力**: ページオブジェクト + 親から伝播された属性
**出力**: 解決済みの属性セット

#### 継承可能な4属性

| 属性 | 型 | デフォルト値 | 備考 |
|:-----|:---|:------------|:-----|
| `/MediaBox` | `[number, number, number, number]` | なし（必須） | ルートに至るまで未定義の場合はエラー |
| `/Resources` | `PdfDictionary` | 空辞書 | 継承時はシャドウイングに注意 |
| `/CropBox` | `[number, number, number, number]` | MediaBoxと同一 | |
| `/Rotate` | `number` | 0 | 0, 90, 180, 270 のみ有効 |

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| IH-001 | ページ直接定義優先 | ページに属性が直接定義 | 継承値ではなくページの値を使用 |
| IH-002 | 親から継承 | ページに未定義、親に存在 | 親の値を使用（再帰的に辿る） |
| IH-003 | MediaBox必須 | ルートまで辿ってもMediaBox未定義 | `PdfParseError` をスロー |
| IH-004 | Rotate正規化 | 0, 90, 180, 270 以外の値 | 90の倍数に丸め（寛容処理） |
| IH-005 | CropBoxデフォルト | CropBox未定義 | MediaBoxと同一値を設定 |

### DocumentInfoParser

**入力**: `TrailerDict` + `ObjectResolver`
**出力**: `DocumentMetadata`

| ID | ルール | 条件 | 振る舞い |
|:---|:-------|:-----|:---------|
| DI-001 | /Info解決 | トレイラの`/Info`が存在 | ObjectResolverで解決し辞書をパース |
| DI-002 | /Info不在 | トレイラに`/Info`がない | 空のDocumentMetadataを返却 |
| DI-003 | 日時パース | `D:YYYYMMDDHHmmSSOHH'mm'` 形式 | Dateオブジェクトに変換 |
| DI-004 | 日時不正 | パースできない日時文字列 | undefined を設定、警告 |

#### PDF日時文字列パース

```
D:YYYYMMDDHHmmSSOHH'mm'
  │    │  │  │  │ │ │  │
  │    │  │  │  │ │ │  └── UTCオフセット分
  │    │  │  │  │ │ └───── UTCオフセット時
  │    │  │  │  │ └────── UTC関係: +/-/Z
  │    │  │  │  └──────── 秒
  │    │  │  └─────────── 分
  │    │  └────────────── 時
  │    └───────────────── 日
  └────────────────────── 年月
```

## ファイル配置

```
packages/core/src/
├── document/
│   ├── index.ts                # 再エクスポート
│   ├── catalog-parser.ts       # CatalogParser
│   ├── page-tree-walker.ts     # PageTreeWalker
│   ├── inheritance-resolver.ts # InheritanceResolver
│   └── document-info-parser.ts # DocumentInfoParser
└── types/
    └── index.ts                # ResolvedPage, DocumentMetadata 追加
```

## 関連仕様

- [object-resolver-spec.md](./object-resolver-spec.md) - ページツリー走査で間接参照を解決
- [document-api-spec.md](./document-api-spec.md) - ResolvedPageをPdfPageにラップ
- [error-handling-spec.md](./error-handling-spec.md) - 継承解決失敗時のエラー
- `docs/specs/03_document_architecture.md` - ページツリーとボックスモデルの仕様
