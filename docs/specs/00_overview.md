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
