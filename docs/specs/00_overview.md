# PDF仕様書 - 目次と概要

> **対象規格**: ISO 32000-1:2008 (PDF 1.7) / ISO 32000-2:2020 (PDF 2.0)  
> **位置づけ**: PDF フォーマットの内部構造と pdfmod の実装方針を章別に整理したリファレンス  
> **関連ドキュメント**: [ドキュメント案内](../README.md) / [図解 HTML 解説](../guides/README.md) / [解析パイプライン仕様](../pdf-parsing-pipeline/index.md)

本ドキュメント群は、PDF フォーマットの内部構造をライブラリ実装の観点から体系的に整理した仕様書です。  
元の調査レポート（[PDFフォーマット仕様調査とライブラリ開発.md](../research/PDFフォーマット仕様調査とライブラリ開発.md)）を機能領域ごとに分割し、実装で決めた判断や回復方針も各章へ統合しています。

## この仕様書の読み方

- **PDF 仕様（ISO 32000）と pdfmod の実装方針を分けて記載**しています。規格上の一般的なルールを先に説明し、pdfmod 固有の判断・制限・回復方針は `pdfmod の実装方針` などの小見出しや表にまとめています。
- **言語中立の図・表・手順**で概念を説明します（特定の実装言語の内部型やメソッドを規定するものではありません）。`@pdfmod/core` 解析パイプラインのモジュール単位の機能仕様とエラーコード正本は [docs/pdf-parsing-pipeline/](../pdf-parsing-pipeline/index.md) を参照してください。
- **節番号（`§X.Y`）はコードや規約からの参照先**として使われています。見出し番号をたどることで、実装と仕様の対応を確認できます。
- 初めて PDF の内部構造に触れる場合は、まず [PDF 仕様入門 (`pdf-primer.md`)](./pdf-primer.md) から読むのがおすすめです。

## 適合性レベル

| 用語 | 定義 |
| :--- | :--- |
| 適合リーダー (Conforming Reader) | PDF ファイルを読み込んで画面表示やインタラクションを提供するソフトウェア |
| 適合ライター (Conforming Writer) | PDF ファイルを生成するソフトウェア |
| 適合製品 (Conforming Product) | リーダーとライターの両機能を備えたソフトウェア |

## 仕様書一覧

### 入門

| ドキュメント | 内容 |
| :--- | :--- |
| [pdf-primer.md](./pdf-primer.md) | 開発者向けの PDF 仕様入門（全体像・9つのデータ型・XRef・解析フロー・用語集） |

### 章別リファレンス

| 章 | ファイル名 | 内容 | 対応する図解 HTML 解説 |
| :--- | :--- | :--- | :--- |
| 01 | [01_lexical_conventions.md](./01_lexical_conventions.md) | レキシカル規約とプリミティブデータ型 | [字句トークンと描画命令](../guides/token-layers.html) / [テキスト文字列](../guides/text-strings.html) |
| 02 | [02_file_structure.md](./02_file_structure.md) | 物理ファイル構造とランダムアクセス機構 | — |
| 02a | [02a_object_resolution.md](./02a_object_resolution.md) | インダイレクトオブジェクト解決の仕組み | — |
| 02b | [02b_encryption.md](./02b_encryption.md) | 暗号化辞書、暗号プリミティブ、R2〜R6 のファイル暗号鍵導出・パスワード認証、オブジェクトの復号鍵 | [暗号化辞書](../guides/encryption-dictionary.html) |
| 03 | [03_document_architecture.md](./03_document_architecture.md) | 論理ドキュメントアーキテクチャとページツリー | [カタログ](../guides/document-catalog.html) / [ページツリー](../guides/page-tree.html) / [境界ボックス](../guides/page-boxes.html) / [文書API](../guides/document-api.html) / [情報辞書](../guides/document-info.html) / [日付](../guides/date-format.html) |
| 04 | [04_resources_graphics_state.md](./04_resources_graphics_state.md) | リソース辞書とグラフィックスステート | [リソース辞書](../guides/resources.html) / [拡張グラフィックス状態](../guides/ext-gstate.html) / [パターンとシェーディング](../guides/patterns-shadings.html) |
| 05 | [05_content_streams.md](./05_content_streams.md) | コンテンツストリームと描画オペレータ | [字句トークンと描画命令](../guides/token-layers.html) / [リソース辞書](../guides/resources.html) |
| 06 | [06_font_architecture.md](./06_font_architecture.md) | タイポグラフィとフォント管理アーキテクチャ | — |
| 07 | [07_compression_filters.md](./07_compression_filters.md) | データ圧縮とストリームフィルタ | — |
| 08 | [08_incremental_update_linearization.md](./08_incremental_update_linearization.md) | インクリメンタルアップデートとリニアライズ | — |
| 09 | [09_implementation_guide.md](./09_implementation_guide.md) | ライブラリ実装ガイドとベストプラクティス | — |

## PDF の本質

PDF は、JSON や XML のような単純なシリアライズデータでも、HTML のように先頭から順次解析するマークアップ言語でもありません。本質的には、**ランダムアクセスを前提とした索引付きの「グラフィカルオブジェクトのデータベース」**です。

### 解析の基本フロー

```text
1. ファイル末尾 (%%EOF) から逆方向にスキャン開始
2. startxref キーワードと xref オフセットを発見
3. 相互参照テーブル (xref) を読み込み（/Prev チェーンも統合）
4. トレイラ辞書を解析
5. /Root（ドキュメントカタログ）を辿る
6. ページツリー（/Pages → /Page）を巡回
7. 各ページのコンテンツストリームを解釈・描画
```

## 標準化の歴史

| 年代 | イベント |
| :--- | :--- |
| 1990年代初頭 | Adobe Systems が PostScript を基盤として開発 |
| 2007年 | 仕様の管理権が ISO に譲渡 |
| 2008年 | PDF 1.7 が **ISO 32000-1:2008** として国際標準化 |
| 2020年 | **ISO 32000-2:2020 (PDF 2.0)** 発行。非推奨機能の削除、最新暗号化、アクセシビリティ強化 |

## 本仕様書群の未カバー領域（今後の仕様化候補）

本仕様書群はリーダー（パーサ）側の物理構造・オブジェクトモデル・コンテンツストリーム・フォントに重点を置いています。以下の領域は今後の実装フェーズに合わせて章や節を追加する候補です。

| 領域 | ISO 32000 参照 | 現状 |
| :--- | :--- | :--- |
| 暗号化文書のオブジェクト単位の復号 | §7.6 | ファイル鍵導出・認証、crypt filter 選択とオブジェクト鍵導出（Algorithm 1 / 1.A）は [02b_encryption.md](./02b_encryption.md) に記載済み。暗号データへの復号の適用と文書読込への統合は #683 |
| 注釈（Annotations: 共通辞書、サブタイプ、外観ストリーム） | §12.5 | ページ `/Annots` の言及のみ |
| インタラクティブフォーム（AcroForm: フィールド辞書、Widget 注釈、XFA） | §12.7 | カタログ `/AcroForm` の名前のみ |
| アクション（`/OpenAction`、`/GoTo`、`/URI`、JavaScript、追加アクション `/AA`） | §12.6 | アウトラインの `/A` の言及のみ |
| Optional Content（レイヤー: OCG / OCMD、`/OCProperties`、BDC `/OC`） | §8.11 | ほぼ未記載 |
| 名前ツリー・番号ツリー（`/Names`、名前付き宛先の解決） | §7.9.6–7.9.7 | 未記載 |
| XMP メタデータ（`/Metadata` ストリーム、情報辞書との同期） | §14.3 | 名前のみ |
| カラーマネジメント（ICC プロファイル、`/OutputIntents`） | §8.6.5, §14.11.5 | 名前のみ |
| 透明性の詳細（透明グループ、isolated / knockout、SMask サブタイプ） | §11 | ExtGState のエントリ列挙のみ |
| 電子署名の検証（PKCS#7、DocMDP / FieldMDP、LTV、複数署名） | §12.8 | 署名辞書と ByteRange の概要のみ（[08章 §5](./08_incremental_update_linearization.md#5-デジタル署名とインクリメンタルアップデート)） |
| テキスト文字列のエンコーディング（PDFDocEncoding / UTF-16BE / PDF 2.0 の UTF-8） | §7.9.2 | `specs/` 内の独立節は未作成（解説は [テキスト文字列ガイド](../guides/text-strings.html) を参照） |
| ドキュメント書き出し（Writer: シリアライズ、xref 生成、オブジェクト番号割り当て） | — | プリミティブの表記形式（01章）と増分保存の概要（08章）のみ |
