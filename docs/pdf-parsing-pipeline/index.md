# PDF解析パイプライン仕様（Phase 1 + 2）

> **対象パッケージ**: `@pdfmod/core`（TypeScript）  
> **位置づけ**: PDF バイナリからドキュメント構造（ページ一覧・メタデータ）を構築する Phase 1（Graph Resolver）・Phase 2（DOM Traverser）のモジュール機能仕様書  
> **関連ドキュメント**: [ドキュメント案内](../README.md) / [PDF 仕様書 (`../specs/00_overview.md`)](../specs/00_overview.md) / [PDF 仕様入門 (`../specs/pdf-primer.md`)](../specs/pdf-primer.md)

## 概要

Lexer / Tokenizer（バイト列 → トークン列）の上に構築する解析パイプラインの仕様を定義します。xref 解析・間接オブジェクト解決・ページツリー走査・エラー体系をモジュール単位のルール ID と表で規定しています。

## スコープ

| 区分 | 内容 |
| :--- | :--- |
| **対象範囲** | ・ファイル末尾からの `startxref` / `%%EOF` 検出<br>・xref 解析（テキスト形式・ストリーム形式・ハイブリッド `/XRefStm`・`/Prev` マージ）<br>・トレイラ辞書解析<br>・Token 列 → `PdfObject` 変換（`ObjectParser`）<br>・間接参照解決（LRU キャッシュ・循環参照検出・ObjStm 抽出）<br>・ページツリー走査（`/Pages` → `/Page`）と 4 属性の継承解決（MediaBox / Resources / CropBox / Rotate）<br>・`PdfDocument` / `PdfPage` パブリック API<br>・壊れた PDF への寛容処理（フォールバック xref スキャナ等）<br>・暗号化 PDF（`/Encrypt`）の検出と明示エラー返却（`ENCRYPTED_PDF_UNSUPPORTED`） |
| **対象外** | ・コンテンツストリーム解釈（Phase 3 — [05章](../specs/05_content_streams.md)）<br>・フォント処理（Phase 4 — [06章](../specs/06_font_architecture.md)）<br>・ドキュメント書き出し（Phase 5）<br>・暗号化 PDF の復号（検出のみ対象。復号仕様は [02b章](../specs/02b_encryption.md)）<br>・汎用ストリームフィルタ展開（本パイプラインでは xref / ObjStm 展開が中心） |

## 仕様書一覧

### 1. XRef・トレイラ解析

| 仕様書 | 担当範囲 |
| :--- | :--- |
| [xref-parser-spec.md](./xref-parser-spec.md) | xref テーブル / ストリーム・トレイラ・マージの統括仕様（`XR` / `XT` / `XS` / `TR` / `XM`） |
| [startxref-scanner.md](./startxref-scanner.md) | ファイル末尾からの `%%EOF` / `startxref` 検出詳細 |
| [xref-table-parser.md](./xref-table-parser.md) | テキスト形式 xref テーブルの解析詳細 |
| [xref-stream-decoder.md](./xref-stream-decoder.md) | 展開済み xref ストリームのエントリデコード詳細 |
| [flatedecode-stream-parser.md](./flatedecode-stream-parser.md) | `FlateDecode` 展開と xref ストリームからの `TrailerDict` 抽出詳細 |
| [xref-merger-spec.md](./xref-merger-spec.md) | `/Prev` チェーン走査・マージ、ハイブリッド参照（`/XRefStm`）詳細 |

### 2. オブジェクト解析・解決

| 仕様書 | 担当範囲 |
| :--- | :--- |
| [object-parser-spec.md](./object-parser-spec.md) | Token 列 → `PdfObject` 変換、間接オブジェクト定義・ストリーム構文詳細 |
| [object-resolver-spec.md](./object-resolver-spec.md) | 間接参照解決（`ObjectStore`）、LRU キャッシュ、循環検出（`OP` / `OR` / `OS`） |
| [object-stream-spec.md](./object-stream-spec.md) | オブジェクトストリーム（ObjStm）の構造・制約・`/Extends` 互換探索 |

### 3. ドキュメント構造・公開 API・エラー体系

| 仕様書 | 担当範囲 |
| :--- | :--- |
| [page-tree-spec.md](./page-tree-spec.md) | カタログ解析、ページツリー走査、属性継承、情報辞書（`CT` / `PW` / `IH` / `DI`） |
| [document-api-spec.md](./document-api-spec.md) | `PdfDocument` / `PdfPage` / `LoadOptions` パブリック API（`DA` / `PP`） |
| [error-handling-spec.md](./error-handling-spec.md) | **エラー/警告コード一覧の正本**、`Result` 設計、フォールバック処理（`FB` / `SL`） |

## 全体の処理フロー

```text
Uint8Array (PDF バイナリ)
    │
    ▼
[1] ヘッダ検証 (%PDF-x.x)
    │
    ▼
[2] %%EOF / startxref スキャン         ← 末尾 1024B（回復時は 4096B）から逆方向探索
    │
    ▼
[3] xref 解析 & /Prev チェーン走査      ← テキスト形式・ストリーム形式・/XRefStm に対応
    │
    ▼
[4] xref マージ                        ← 新しいセクションのエントリを優先
    │
    ▼
[5] トレイラ → /Root 解決              ← ObjectStore + LRU キャッシュ + 循環検出
    │
    ▼
[6] カタログ辞書・/Info 解析
    │
    ▼
[7] ページツリー走査 & 属性継承解決      ← /Pages → /Page、4 属性の継承
    │
    ▼
PdfDocument (ページ一覧 + メタデータ)
```

## ユーザーストーリー

| ID | 対象 | やりたいこと | 目的 | 優先度 |
| :--- | :--- | :--- | :--- | :--- |
| US-001 | ライブラリ利用者 | `Uint8Array` から `PdfDocument` を読み込む | ページ数やメタデータへアクセスするため | 高 |
| US-002 | ライブラリ利用者 | 特定ページの `MediaBox` や `Rotate` を取得する | ページの寸法・向きを把握するため | 高 |
| US-003 | ライブラリ利用者 | 軽微な破損のある PDF も可能な限り解析する | 実世界の多様な PDF を扱うため | 中 |
| US-004 | ライブラリ利用者 | 大規模 PDF でもメモリ過剰消費を避ける | ブラウザ環境でも安全に動作させるため | 中 |

## 非機能要件

| カテゴリ | 要件 | 目標値 |
| :--- | :--- | :--- |
| パフォーマンス | 1 MB の PDF のドキュメント構造構築 | 100 ms 以内 |
| メモリ | 100 MB の PDF 読み込み時ピークメモリ | 入力サイズの 2 倍以内 |
| メモリ | LRU キャッシュ上限 | 設定可能（既定 1024 エントリ） |
| 互換性 | ブラウザ | Chrome / Firefox / Safari / Edge 最新 2 バージョン |
| 互換性 | Node.js | 24.x |

## 用語集

| 用語 | 定義 |
| :--- | :--- |
| **xref** | Cross-Reference Table。オブジェクト番号 → ファイル内位置の索引 |
| **インダイレクト参照** | `N G R` 形式のオブジェクト間ポインタ（例: `5 0 R`） |
| **MediaBox** | ページの物理寸法を定義する矩形 `[llx lly urx ury]`（座標原点は左下） |
| **オブジェクトストリーム** | 複数の PDF オブジェクトを 1 つのストリーム内にパックした構造（PDF 1.5+） |
| **LRU** | Least Recently Used。最も古く使われたエントリから追い出すキャッシュ戦略 |
| **Postel の法則** | 「送信するものについては厳密に、受信するものについては寛容に」 |
