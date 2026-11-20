# 06. タイポグラフィとフォント管理アーキテクチャ

> **対応規格**: ISO 32000-1:2008 §9.6–9.10 / ISO 32000-2:2020 §9.6–9.10  
> **扱う内容**: 単純フォント（Type 1 / TrueType / Type 3）、エンコーディング、複合フォント（Type 0 / CIDFont / CMap / CIDToGIDMap）、フォント記述子、`/ToUnicode` によるテキスト抽出、フォントサブセッティング

## 目次

1. [概要](#1-概要)
2. [フォントの分類体系](#2-フォントの分類体系)
3. [単純フォント（Simple Fonts）](#3-単純フォントsimple-fonts)
4. [複合フォント（Composite Fonts）とCJKサポート](#4-複合フォントcomposite-fontsとcjkサポート)
5. [フォント記述子（FontDescriptor）](#5-フォント記述子fontdescriptor)
6. [テキスト抽出と ToUnicode マッピング](#6-テキスト抽出と-tounicode-マッピング)
7. [フォントサブセッティング](#7-フォントサブセッティング)

---

## 1. 概要

PDF のコンテンツストリームに書かれたバイト列は、そのまま Unicode の文字（テキストの意味）を表しているわけではありません。それは**フォント内の特定の「グリフ（図形）」を引くためのインデックスキー**にすぎません。

そのため「画面に正しく描画すること」と「コピー＆ペーストや検索のためにテキストを抽出すること」は別のパイプラインとなり、ここが PDF ライブラリ実装における最大の難所になります。

---

## 2. フォントの分類体系

```text
PDF フォント
├── 単純フォント (Simple Fonts) — 1 バイト = 最大 256 グリフ（主に欧文）
│   ├── Type 1
│   ├── TrueType
│   ├── Type 3
│   └── (MMType1 - Multiple Master, 非推奨)
└── 複合フォント (Composite Fonts) — マルチバイト対応（日本語など CJK）
    └── Type 0
        └── CIDFont
            ├── CIDFontType0 (Type 1 / CFF ベース)
            └── CIDFontType2 (TrueType ベース)
```

---

## 3. 単純フォント（Simple Fonts）

### 3.1 基本特性

- ストリーム内の文字列を **「1 バイト = 1 グリフ」** として処理する。
- 最大 **256 個** のグリフのみマッピング可能。
- 主に欧文（ラテン文字系）ドキュメントで使用される。

### 3.2 フォント辞書の共通構造

```pdf
6 0 obj
<< /Type /Font
   /Subtype /Type1
   /BaseFont /Helvetica
   /Encoding /WinAnsiEncoding
   /FirstChar 32
   /LastChar 255
   /Widths [...]
   /FontDescriptor 7 0 R
>>
endobj
```

#### 共通エントリ

| キー | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `/Type` | 名前 | **必須** | `/Font` |
| `/Subtype` | 名前 | **必須** | `/Type1`, `/TrueType`, `/Type3` |
| `/BaseFont` | 名前 | **必須** | フォントの PostScript 名 |
| `/Encoding` | 名前 or 辞書 | 条件付き | 文字コード → グリフ名のエンコーディング定義 |
| `/FirstChar` | 整数 | 条件付き | `/Widths` 配列の先頭に対応する文字コード |
| `/LastChar` | 整数 | 条件付き | `/Widths` 配列の末尾に対応する文字コード |
| `/Widths` | 配列 | 条件付き | 各文字の幅（グリフ空間の 1/1000 単位） |
| `/FontDescriptor` | 辞書 | 条件付き | フォントの詳細メトリクス・埋め込みデータ情報 |
| `/ToUnicode` | ストリーム | 任意 | 文字コード → Unicode 変換マップ |

### 3.3 Type 1 フォント

- Adobe PostScript 技術に基づき、**3 次ベジェ曲線**でグリフを定義する。
- PDF 1.x では次の **Standard 14 Fonts** が定義されている。

#### Standard 14 Fonts

| 系統 | フォント名 |
| :--- | :--- |
| Times（セリフ体） | `Times-Roman`, `Times-Bold`, `Times-Italic`, `Times-BoldItalic` |
| Helvetica（サンセリフ体） | `Helvetica`, `Helvetica-Bold`, `Helvetica-Oblique`, `Helvetica-BoldOblique` |
| Courier（等幅体） | `Courier`, `Courier-Bold`, `Courier-Oblique`, `Courier-BoldOblique` |
| 記号・装飾 | `Symbol`, `ZapfDingbats` |

> **注意**: PDF 2.0 では Standard 14 Fonts の暗黙的な存在保証は非推奨となりました。互換性のため、生成時はすべてのフォントを埋め込むことが推奨されます。

### 3.4 TrueType フォント

- **2 次ベジェ曲線**でグリフを定義する。
- 埋め込みフォントプログラムは `/FontDescriptor` の `/FontFile2` ストリームに格納される。

```pdf
6 0 obj
<< /Type /Font
   /Subtype /TrueType
   /BaseFont /ArialMT
   /Encoding /WinAnsiEncoding
   /FirstChar 32
   /LastChar 255
   /Widths [...]
   /FontDescriptor 7 0 R
>>
endobj
```

### 3.5 Type 3 フォント

グリフの形状そのものを **PDF コンテンツストリームの描画命令** で直接定義する特殊フォントです。

```pdf
6 0 obj
<< /Type /Font
   /Subtype /Type3
   /FontBBox [0 0 1000 1000]
   /FontMatrix [0.001 0 0 0.001 0 0]
   /CharProcs << /A 10 0 R /B 11 0 R >>
   /Encoding << /Type /Encoding /Differences [65 /A /B] >>
   /FirstChar 65
   /LastChar 66
   /Widths [600 600]
>>
endobj
```

#### Type 3 固有のエントリ

| キー | 型 | 説明 |
| :--- | :--- | :--- |
| `/FontBBox` | 配列 | フォント全体のバウンディングボックス |
| `/FontMatrix` | 配列 | グリフ空間からテキスト空間への変換行列 |
| `/CharProcs` | 辞書 | グリフ名 → 描画命令ストリームのマップ |
| `/Resources` | 辞書 | グリフストリーム内で使うリソース辞書 |

- グリフに複数色・画像・複雑な図形を使える一方、メトリクス精度が低くなりがちで `/ToUnicode` 無しのテキスト抽出が困難になる。

### 3.6 エンコーディング

#### 定義済みエンコーディング

| エンコーディング名 | 説明 |
| :--- | :--- |
| `/StandardEncoding` | Adobe 標準エンコーディング |
| `/MacRomanEncoding` | Mac Roman エンコーディング |
| `/WinAnsiEncoding` | Windows ANSI（Latin-1 相当） |
| `/MacExpertEncoding` | Mac Expert エンコーディング |

#### カスタムエンコーディング（`/Differences` 配列）

```pdf
/Encoding <<
  /Type /Encoding
  /BaseEncoding /WinAnsiEncoding
  /Differences [
    128 /Euro           % 文字コード 128 に Euro 記号を割り当て
    160 /nbspace        % 文字コード 160 に非改行スペースを割り当て
  ]
>>
```

`/Differences` 配列では「整数（開始文字コード）」の後に「名前（グリフ名）」を並べます。名前が連続する場合は、開始文字コードから `+1` ずつ順に割り当てられます。

---

## 4. 複合フォント（Composite Fonts）とCJKサポート

日本語・中国語・韓国語（CJK）のように数千〜数万のグリフを扱う言語では、Type 0 ルート辞書と子孫の CIDFont 辞書を組み合わせた**複合フォント**を使用します。

### 4.1 構造概要

```text
Type 0 (ルート辞書)
  ├── /Encoding: CMap（バイト列 → CID）
  └── /DescendantFonts: [CIDFont]
        ├── CIDFontType0 (Type 1 / CFF アウトライン)
        └── CIDFontType2 (TrueType アウトライン)
```

### 4.2 Type 0 フォント辞書

```pdf
20 0 obj
<< /Type /Font
   /Subtype /Type0
   /BaseFont /KozMinPro-Regular-UniJIS-UTF16-H
   /Encoding /UniJIS-UTF16-H
   /DescendantFonts [21 0 R]
   /ToUnicode 22 0 R
>>
endobj
```

| キー | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `/Type` | 名前 | **必須** | `/Font` |
| `/Subtype` | 名前 | **必須** | `/Type0` |
| `/BaseFont` | 名前 | **必須** | フォント識別名 |
| `/Encoding` | 名前 or ストリーム | **必須** | CMap の定義済み名前または埋め込み CMap ストリーム |
| `/DescendantFonts` | 配列 | **必須** | CIDFont への参照（要素数は常に 1） |
| `/ToUnicode` | ストリーム | 推奨 | Unicode 変換 CMap |

### 4.3 CIDFont 辞書

```pdf
21 0 obj
<< /Type /Font
   /Subtype /CIDFontType2
   /BaseFont /KozMinPro-Regular
   /CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >>
   /FontDescriptor 23 0 R
   /DW 1000
   /W [1 [250 500] 231 [600]]
   /CIDToGIDMap /Identity
>>
endobj
```

| キー | 型 | 必須 | 説明 |
| :--- | :--- | :--- | :--- |
| `/Type` | 名前 | **必須** | `/Font` |
| `/Subtype` | 名前 | **必須** | `/CIDFontType0` または `/CIDFontType2` |
| `/BaseFont` | 名前 | **必須** | フォントの PostScript 名 |
| `/CIDSystemInfo` | 辞書 | **必須** | 文字コレクション情報（`/Registry`, `/Ordering`, `/Supplement`） |
| `/FontDescriptor` | 辞書 | **必須** | フォント記述子 |
| `/DW` | 整数 | 任意 | 既定の文字幅（既定値 `1000`） |
| `/W` | 配列 | 任意 | 個別の文字幅定義 |
| `/DW2` / `/W2` | 配列 | 任意 | 縦書き用の既定/個別メトリクス |
| `/CIDToGIDMap` | ストリーム or 名前 | 条件付き | CID → GID（TrueType グリフ ID）の変換マップ |

#### `/W` 配列の 2 パターン

```pdf
/W [
  1 [250 333 408]    % パターン1: CID_start [w1 w2 ...] → CID 1=250, 2=333, 3=408
  231 395 500        % パターン2: CID_first CID_last w  → CID 231〜395 はすべて幅 500
]
```

#### `CIDSystemInfo` 辞書

| キー | 型 | 例 |
| :--- | :--- | :--- |
| `/Registry` | 文字列 | ベンダー名（例: `(Adobe)`） |
| `/Ordering` | 文字列 | 文字コレクション名（例: `(Japan1)`, `(Korea1)`, `(CNS1)`, `(GB1)`） |
| `/Supplement` | 整数 | コレクションの拡張リビジョン番号 |

### 4.4 マルチステージ・ルックアップ・パイプライン

複合フォントの描画は 4 段階の変換パイプラインで行われます。

```text
[ステージ 1: 文字コード → CID]
  テキストストリーム (マルチバイト) ──→ CMap デコード ──→ CID

[ステージ 2: CID → メトリクス取得]
  CID ──→ CIDFont (/W, /DW) ──→ 文字幅を取得

[ステージ 3: CID → GID（CIDFontType2 のみ）]
  CID ──→ /CIDToGIDMap ──→ GID (フォント内グリフ ID)

[ステージ 4: GID → グリフ描画]
  GID ──→ 埋め込みフォントプログラム (TrueType / CFF) ──→ グリフ描画
```

### 4.5 CMap（Character Map）

入力バイト列を CID（Character Identifier）へ変換する対応表です。

#### 代表的な定義済み CMap

| CMap 名 | 説明 |
| :--- | :--- |
| `Identity-H` / `Identity-V` | CID = 文字コードそのまま（横書き / 縦書き） |
| `UniJIS-UTF16-H` | UTF-16 → Adobe-Japan1 |
| `83pv-RKSJ-H` | Shift_JIS → Adobe-Japan1 |
| `UniKS-UTF16-H` | UTF-16 → Adobe-Korea1 |
| `UniGB-UTF16-H` | UTF-16 → Adobe-GB1 |
| `UniCNS-UTF16-H` | UTF-16 → Adobe-CNS1 |

#### 埋め込み CMap ストリームの例

```pdf
/CMapName /CustomCMap def
/CIDSystemInfo << /Registry (Adobe) /Ordering (Japan1) /Supplement 6 >> def

1 begincodespacerange
  <0000> <FFFF>
endcodespacerange

3 beginbfchar
  <0041> <0041>
  <0042> <0042>
  <0043> <0043>
endbfchar

2 beginbfrange
  <0044> <005A> <0044>
  <0061> <007A> <0061>
endbfrange
```

### 4.6 `CIDToGIDMap`

CID から TrueType の GID を求める規則は次の 2 通りです。

| 指定形式 | 変換ルール |
| :--- | :--- |
| `/Identity` | `GID = CID`（数値をそのまま使用） |
| ストリーム（バイナリ表） | 1 エントリ 2 バイトのビッグエンディアン符号なし整数テーブル。`offset = CID × 2` から 2 バイトを読み取り GID とする。ストリーム長を超える場合は `0`（`.notdef`）へフォールバック |

### 4.7 CID 0 の規則

すべての CIDFont は **CID 0（`.notdef`）のグリフを必ず定義**しなければなりません。未定義文字のフォールバック（いわゆる「豆腐」□ 等）として使われます。

---

## 5. フォント記述子（FontDescriptor）

フォントの詳細メトリクスと埋め込みフォントデータを保持する辞書です。

```pdf
7 0 obj
<< /Type /FontDescriptor
   /FontName /ArialMT
   /Flags 32
   /FontBBox [-665 -325 2000 1006]
   /ItalicAngle 0
   /Ascent 905
   /Descent -212
   /CapHeight 718
   /StemV 80
   /FontFile2 8 0 R
>>
endobj
```

### 5.1 主要エントリ

| キー | 型 | 説明 |
| :--- | :--- | :--- |
| `/Type` | 名前 | `/FontDescriptor` |
| `/FontName` | 名前 | フォントの PostScript 名 |
| `/Flags` | 整数 | フォント特性フラグ（ビットフィールド、§5.2） |
| `/FontBBox` | 配列 | 全グリフのバウンディングボックス |
| `/ItalicAngle` | 実数 | 斜体角度（度、`0` = 直立） |
| `/Ascent` | 実数 | アセンダ値（ベースライン上の高さ） |
| `/Descent` | 実数 | ディセンダ値（ベースライン下の深さ、負値） |
| `/CapHeight` | 実数 | 大文字の高さ |
| `/StemV` | 実数 | 垂直ステムの太さ |
| `/FontFile` | ストリーム | Type 1 フォントプログラム |
| `/FontFile2` | ストリーム | TrueType / OpenType フォントプログラム |
| `/FontFile3` | ストリーム | CFF / OpenType CFF フォントプログラム |

### 5.2 フォントフラグ（ビットフィールド）

| ビット（1 起点） | 値 | 意味 |
| :--- | :--- | :--- |
| 1 | `1` | FixedPitch（等幅フォント） |
| 2 | `2` | Serif（セリフ体） |
| 3 | `4` | Symbolic（記号フォント） |
| 4 | `8` | Script（筆記体） |
| 6 | `32` | Nonsymbolic（非記号、ラテン文字ベース） |
| 7 | `64` | Italic（斜体） |
| 17 | `65536` | AllCap（すべて大文字） |
| 18 | `131072` | SmallCap（スモールキャップ） |
| 19 | `262144` | ForceBold（太字を強制） |

---

## 6. テキスト抽出と ToUnicode マッピング

### 6.1 テキスト抽出の課題

- 画面上は読めても、ストリーム内のバイト列はサブセットフォント独自の CID や GID になっていることが多い。
- PDF には「単語間のスペース」が明示文字として入らず、座標移動（`Td`, `TJ` 等）だけで空けられている場合が多い。

### 6.2 `ToUnicode` CMap

フォント辞書の `/ToUnicode` に格納される、文字コード → UTF-16 Unicode コードポイントの変換表です。

```pdf
/CMapType 2 def
1 begincodespacerange
  <0000> <FFFF>
endcodespacerange

5 beginbfchar
  <0003> <0020>        % 0x0003 → U+0020 (スペース)
  <0010> <0048>        % 0x0010 → U+0048 ('H')
  <0011> <0065>        % 0x0011 → U+0065 ('e')
  <0012> <006C>        % 0x0012 → U+006C ('l')
  <0013> <006F>        % 0x0013 → U+006F ('o')
endbfchar

2 beginbfrange
  <0020> <007E> <0020> % 0x0020〜0x007E → U+0020〜U+007E
  <00A0> <00FF> <00A0> % 0x00A0〜0x00FF → U+00A0〜U+00FF
endbfrange
```

#### 描画とテキスト抽出のパイプライン比較

```text
描画パイプライン（見た目）:
  文字コード ──→ CMap ──→ CID ──→ GID ──→ グリフ描画

テキスト抽出パイプライン（意味）:
  文字コード ──→ /ToUnicode CMap ──→ UTF-16 Unicode コードポイント
```

### 6.3 `ToUnicode` が存在しない場合

1. `/Encoding` からグリフ名を取得する。
2. Adobe Glyph List（AGL）でグリフ名 → Unicode へ変換を試みる。
3. それも得られない場合、テキスト情報は構造上復元不能であり、OCR などのヒューリスティックに頼るしかない。

### 6.4 単語境界の再構築

PDF には明示的なスペースや改行文字が無いことが多いため、グリフの幾何学座標から単語・行の境界を推定します。

1. 各グリフのバウンディングボックス（位置 `x, y` と幅 `width`）を算出する。
2. 隣接する 2 グリフ間の水平ギャップ `gap = glyph2.x - (glyph1.x + glyph1.width)` を求める。
3. `gap > space_width × 0.3`（スペース幅の一定割合、目安 30%）を超えれば**単語境界**、垂直位置の変化が閾値を超えれば**行境界**と判定する。

---

## 7. フォントサブセッティング

フォント全体（特に日本語フォント）を埋め込むとファイルサイズが膨大になるため、文書内で実際に使ったグリフだけを抜き出した**サブセットフォント**が広く使われます。

### 7.1 サブセット識別子

```pdf
/BaseFont /ABCDEF+ArialMT
```

- ランダムな大文字アルファベット 6 文字 + `+` + 元のフォント名、という慣例的な命名規則で表す。

### 7.2 実装上の注意

- 未使用グリフは含まれないため、既存テキストへの文字追加など編集操作を行う場合は別の完全フォントやシステムフォントが必要になる。
- サブセットフォントに `/ToUnicode` CMap が欠けていると、文字コードが連番再割り当てされているためテキスト抽出は極めて困難になる。

---

[← 前の章: 05. コンテンツストリーム (`05_content_streams.md`)](./05_content_streams.md) | [目次](./00_overview.md) | [次の章: 07. データ圧縮とストリームフィルタ (`07_compression_filters.md`) →](./07_compression_filters.md)
