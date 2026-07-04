# PDF仕様書 - 目次と概要

本ドキュメント群は、PDFフォーマットの内部構造をライブラリ実装の観点から体系的に整理した詳細仕様書である。

元の総合レポート「PDFフォーマット仕様調査とライブラリ開発.md」を、機能領域ごとに分割・詳細化した構成となっている。

## 対象規格

- **ISO 32000-1:2008** (PDF 1.7)
- **ISO 32000-2:2020** (PDF 2.0)

## 適合性レベル

| 用語 | 定義 |
|:-----|:-----|
| 適合リーダー (Conforming Reader) | PDFファイルを読み込んで画面表示やインタラクションを提供するソフトウェア |
| 適合ライター (Conforming Writer) | PDFファイルを生成するソフトウェア |
| 適合製品 (Conforming Product) | リーダーとライターの両機能を備えたソフトウェア |

## 仕様書一覧

| No. | ファイル名 | 内容 |
|:----|:-----------|:-----|
| 01 | [01_lexical_conventions.md](./01_lexical_conventions.md) | レキシカル規約とプリミティブデータ型 |
| 02 | [02_file_structure.md](./02_file_structure.md) | 物理ファイル構造とランダムアクセス機構 |
| 02a | [02a_object_resolution.md](./02a_object_resolution.md) | インダイレクトオブジェクト解決の仕組み |
| 03 | [03_document_architecture.md](./03_document_architecture.md) | 論理ドキュメントアーキテクチャとページツリー |
| 04 | [04_resources_graphics_state.md](./04_resources_graphics_state.md) | リソース辞書とグラフィックスステート |
| 05 | [05_content_streams.md](./05_content_streams.md) | コンテンツストリームと描画オペレータ |
| 06 | [06_font_architecture.md](./06_font_architecture.md) | タイポグラフィとフォント管理アーキテクチャ |
| 07 | [07_compression_filters.md](./07_compression_filters.md) | データ圧縮とストリームフィルタ |
| 08 | [08_incremental_update_linearization.md](./08_incremental_update_linearization.md) | インクリメンタルアップデートとリニアライズ |
| 09 | [09_implementation_guide.md](./09_implementation_guide.md) | ライブラリ実装ガイドとベストプラクティス |

## PDFの本質

PDFは、JSONやXMLのような単純なシリアライズデータや、HTMLのような上から下へ順次解析できるマークアップ言語ではない。本質的に、**ランダムアクセスを前提としたインデックス付きのバイナリエンコードされた「グラフィカルオブジェクトのデータベース」**として機能する。

### 解析の基本フロー

```
1. ファイル末尾 (%%EOF) からスキャン開始
2. startxref キーワードを発見
3. 相互参照テーブル (xref) を読み込み
4. トレイラ辞書を解析
5. /Root (ドキュメントカタログ) を辿る
6. ページツリーを巡回
7. 各ページのコンテンツストリームを解釈・描画
```

## 標準化の歴史

| 年代 | イベント |
|:-----|:--------|
| 1990年代初頭 | Adobe SystemsがPostScriptを基盤として開発 |
| 2007年 | 仕様の管理権がISOに譲渡 |
| 2008年 | PDF 1.7が **ISO 32000-1:2008** として国際標準化 |
| 2020年 | **ISO 32000-2:2020 (PDF 2.0)** 発行。非推奨機能の削除、最新暗号化、アクセシビリティ強化 |

## 本仕様書群の未カバー領域（今後の仕様化候補）

本仕様書群はパーサ（リーダー）側の物理構造・オブジェクトモデル・コンテンツストリーム・フォントに重点を置いており、以下の領域は未カバーまたは名前の言及に留まる。実装フェーズの進行に合わせて章の追加が必要である。

| 領域 | ISO 32000 参照 | 現状 |
|:-----|:---------------|:-----|
| 暗号化・セキュリティハンドラ（RC4 / AES-128 / AES-256、暗号化辞書、鍵導出、パスワード認証） | §7.6 | ほぼ未記載（トレイラ `/Encrypt` と `/Crypt` フィルタの名前のみ） |
| 注釈（Annotations: 共通辞書、サブタイプ、外観ストリーム） | §12.5 | ページ `/Annots` の言及のみ |
| インタラクティブフォーム（AcroForm: フィールド辞書、Widget 注釈、XFA） | §12.7 | カタログ `/AcroForm` の名前のみ |
| アクション（`/OpenAction`、`/GoTo`、`/URI`、JavaScript、追加アクション `/AA`） | §12.6 | アウトラインの `/A` の言及のみ |
| Optional Content（レイヤー: OCG / OCMD、`/OCProperties`、BDC `/OC`） | §8.11 | ほぼ未記載 |
| 名前ツリー・番号ツリー（`/Names`、名前付き宛先の解決） | §7.9.6–7.9.7 | 未記載 |
| XMP メタデータ（`/Metadata` ストリーム、情報辞書との同期） | §14.3 | 名前のみ |
| カラーマネジメント（ICC プロファイル、`/OutputIntents`） | §8.6.5, §14.11.5 | 名前のみ |
| 透明性の詳細（透明グループ、isolated / knockout、SMask サブタイプ） | §11 | ExtGState のエントリ列挙のみ |
| 電子署名の検証（PKCS#7、DocMDP / FieldMDP、LTV、複数署名） | §12.8 | 署名辞書と ByteRange の概要のみ（08章 §5） |
| テキスト文字列のエンコーディング（PDFDocEncoding / UTF-16BE / PDF 2.0 の UTF-8） | §7.9.2 | 未記載（実装ドキュメント側に PDFDocEncoding のみあり） |
| ドキュメント書き出し（Writer: シリアライズ、xref 生成、オブジェクト番号割り当て） | — | プリミティブの表記形式（01章）と増分保存の概要（08章）のみ |
