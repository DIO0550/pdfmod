# 06. タイポグラフィとフォント管理アーキテクチャ

## 1. 概要

PDFにおいて、ストリーム内に記述されたバイトコードは、セマンティックなテキスト（Unicode）を直接意味しているわけではなく、**フォントファイル内の特定の「グリフ（図形）」を指定するためのインデックスキー**に過ぎない。

これがPDFライブラリ開発における最大の壁となる。

## 2. フォントの分類体系

```
PDFフォント
├── 単純フォント (Simple Fonts)
│   ├── Type 1
│   ├── TrueType
│   ├── Type 3
│   └── (MMType1 - Multiple Master, 非推奨)
└── 複合フォント (Composite Fonts)
    └── Type 0
        └── CIDFont
            ├── CIDFontType0 (Type 1ベース)
            └── CIDFontType2 (TrueTypeベース)
```

## 3. 単純フォント（Simple Fonts）

### 3.1 基本特性

- ストリーム内の文字列を **「1バイト＝1文字（グリフ）」** として処理
- 最大 **256個** のグリフのみマッピング可能
- 主に欧文（ラテン文字系）のドキュメントで使用

### 3.2 フォント辞書の共通構造

```
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
|:-----|:---|:-----|:-----|
| `/Type` | 名前 | **必須** | `/Font` |
| `/Subtype` | 名前 | **必須** | `/Type1`, `/TrueType`, `/Type3` |
| `/BaseFont` | 名前 | **必須** | フォントのPostScript名 |
| `/Encoding` | 名前 or 辞書 | 条件付き | エンコーディング定義 |
| `/FirstChar` | 整数 | 条件付き | `/Widths` 配列の最初の文字コード |
| `/LastChar` | 整数 | 条件付き | `/Widths` 配列の最後の文字コード |
| `/Widths` | 配列 | 条件付き | 各文字の幅（グリフ空間の1/1000単位） |
| `/FontDescriptor` | 辞書 | 条件付き | フォントの詳細メトリクス情報 |
| `/ToUnicode` | ストリーム | 任意 | Unicode変換マップ |

### 3.3 Type 1 フォント

- Adobe PostScript技術に基づく
- **3次ベジェ曲線**でグリフを定義
- PDF標準の14フォント（Standard 14 Fonts）が定義されている

#### Standard 14 Fonts

| フォント名 | 説明 |
|:-----------|:-----|
| Times-Roman | Times系セリフ体（標準） |
| Times-Bold | Times系セリフ体（太字） |
| Times-Italic | Times系セリフ体（斜体） |
| Times-BoldItalic | Times系セリフ体（太字斜体） |
| Helvetica | Helvetica系サンセリフ体（標準） |
| Helvetica-Bold | Helvetica系サンセリフ体（太字） |
| Helvetica-Oblique | Helvetica系サンセリフ体（斜体） |
| Helvetica-BoldOblique | Helvetica系サンセリフ体（太字斜体） |
| Courier | Courier系等幅体（標準） |
| Courier-Bold | Courier系等幅体（太字） |
| Courier-Oblique | Courier系等幅体（斜体） |
| Courier-BoldOblique | Courier系等幅体（太字斜体） |
| Symbol | Symbol記号フォント |
| ZapfDingbats | 装飾記号フォント |

**注意**: PDF 2.0ではStandard 14 Fontsの暗黙的な存在保証は非推奨化されている。すべてのフォントは埋め込みを推奨。

### 3.4 TrueType フォント

- **2次ベジェ曲線**でグリフを定義
- PDF内でフォント辞書としてラップされて組み込まれる
- `/FontDescriptor` の `/FontFile2` エントリに埋め込みフォントデータ

```
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

グリフの形状がPDFのコンテンツストリームオペレータで直接定義される特殊フォント。

```
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
|:-----|:---|:-----|
| `/FontBBox` | 配列 | フォントのバウンディングボックス |
| `/FontMatrix` | 配列 | グリフ空間からテキスト空間への変換行列 |
| `/CharProcs` | 辞書 | グリフ名とストリームオブジェクトのマッピング |
| `/Resources` | 辞書 | グリフストリーム内で使用されるリソース |

#### 特徴
- グリフに**複数の色**を使用可能
- グリフに**画像や複雑な図形**を埋め込み可能
- フォントメトリクスの精度が低い場合がある
- テキスト抽出が困難

### 3.6 エンコーディング

#### 定義済みエンコーディング

| エンコーディング名 | 説明 |
|:-------------------|:-----|
| `/StandardEncoding` | Adobe標準エンコーディング |
| `/MacRomanEncoding` | Mac Roman エンコーディング |
| `/WinAnsiEncoding` | Windows ANSI (Latin-1相当) |
| `/MacExpertEncoding` | Mac Expert エンコーディング |

#### カスタムエンコーディング（Differences配列）

```
/Encoding <<
  /Type /Encoding
  /BaseEncoding /WinAnsiEncoding
  /Differences [
    128 /Euro           % 文字コード128にEuro記号を割り当て
    160 /nbspace        % 文字コード160に非改行スペースを割り当て
  ]
>>
```

`/Differences` 配列のフォーマット:
- 整数: 以降のグリフ名が割り当てられる開始文字コード
- 名前: その文字コードに割り当てるグリフ名（連続して割り当て）

## 4. 複合フォント（Composite Fonts）とCJKサポート

### 4.1 構造概要

```
Type 0 (ルート辞書)
  ├── /Encoding: CMap
  └── /DescendantFonts: [CIDFont]
        ├── CIDFontType0 (Type 1アウトライン)
        └── CIDFontType2 (TrueTypeアウトライン)
```

### 4.2 Type 0 フォント辞書

```
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
|:-----|:---|:-----|:-----|
| `/Type` | 名前 | **必須** | `/Font` |
| `/Subtype` | 名前 | **必須** | `/Type0` |
| `/BaseFont` | 名前 | **必須** | フォントの識別名 |
| `/Encoding` | 名前 or ストリーム | **必須** | CMapの名前またはストリーム |
| `/DescendantFonts` | 配列 | **必須** | CIDFontへの参照（要素は1つのみ） |
| `/ToUnicode` | ストリーム | 推奨 | Unicode変換CMap |

### 4.3 CIDFont辞書

```
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
|:-----|:---|:-----|:-----|
| `/Type` | 名前 | **必須** | `/Font` |
| `/Subtype` | 名前 | **必須** | `/CIDFontType0` or `/CIDFontType2` |
| `/BaseFont` | 名前 | **必須** | フォントのPostScript名 |
| `/CIDSystemInfo` | 辞書 | **必須** | 文字コレクション情報 |
| `/FontDescriptor` | 辞書 | **必須** | フォント記述子 |
| `/DW` | 整数 | 任意 | デフォルトの文字幅（デフォルト: 1000） |
| `/W` | 配列 | 任意 | 個別の文字幅定義 |
| `/DW2` | 配列 | 任意 | デフォルトの縦書きメトリクス |
| `/W2` | 配列 | 任意 | 個別の縦書きメトリクス |
| `/CIDToGIDMap` | ストリーム or 名前 | 条件付き | CIDからGIDへの変換マップ |

#### /W 配列のフォーマット

2つのパターンが混在する。

```
/W [
  CID_start [width1 width2 ...]     % パターン1: 連続するCIDに個別の幅
  CID_first CID_last width          % パターン2: CID範囲に一律の幅
]

例:
/W [
  1 [250 333 408]     % CID 1=250, CID 2=333, CID 3=408
  231 395 500          % CID 231〜395は全て幅500
]
```

#### CIDSystemInfo辞書

| キー | 型 | 説明 |
|:-----|:---|:-----|
| `/Registry` | 文字列 | フォントベンダー名（例: "Adobe"） |
| `/Ordering` | 文字列 | 文字コレクション名（例: "Japan1", "Korea1", "CNS1", "GB1"） |
| `/Supplement` | 整数 | 補足番号（コレクションの拡張バージョン） |

### 4.4 マルチステージ・ルックアップ・パイプライン

複合フォントを正しくレンダリングするための完全な処理フロー。

```
ステージ1: 文字コード → CID
+------------------+    +---------+    +-----+
| テキストストリーム  | → |  CMap   | → | CID |
| (マルチバイト)     |    | デコード |    |     |
+------------------+    +---------+    +-----+

ステージ2: CID → メトリクス取得
+-----+    +----------+    +--------+
| CID | → | CIDFont  | → | 文字幅  |
|     |    | /W, /DW  |    | 取得    |
+-----+    +----------+    +--------+

ステージ3: CID → GID（CIDFontType2のみ）
+-----+    +---------------+    +-----+
| CID | → | /CIDToGIDMap  | → | GID  |
|     |    | (バイナリマップ)|    |     |
+-----+    +---------------+    +-----+

ステージ4: GID → グリフ描画
+-----+    +------------------+    +--------+
| GID | → | フォントプログラム  | → | グリフ  |
|     |    | (TrueType/CFF)    |    | 描画    |
+-----+    +------------------+    +--------+
```

### 4.5 CMap（Character Map）

入力されたバイト列をCID（Character Identifier）に変換する辞書プログラム。

#### 定義済みCMap（名前参照）

| CMap名 | 説明 |
|:-------|:-----|
| `Identity-H` | CID = 文字コード（水平書き） |
| `Identity-V` | CID = 文字コード（垂直書き） |
| `UniJIS-UTF16-H` | UTF-16からAdobe-Japan1へのマッピング |
| `83pv-RKSJ-H` | Shift_JISからAdobe-Japan1へのマッピング |
| `UniKS-UTF16-H` | UTF-16からAdobe-Korea1へのマッピング |
| `UniGB-UTF16-H` | UTF-16からAdobe-GB1へのマッピング |
| `UniCNS-UTF16-H` | UTF-16からAdobe-CNS1へのマッピング |

#### 埋め込みCMapストリーム

```
/CMapName /CustomCMap def
/CIDSystemInfo <<
  /Registry (Adobe)
  /Ordering (Japan1)
  /Supplement 6
>> def

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

### 4.6 CIDToGIDMap

- `/Identity`: CIDとGIDの数値は同一とみなす
- ストリーム: 2バイト/エントリのバイナリマッピングテーブル

```
実装:
fn cid_to_gid(cid: u16, map: &CIDToGIDMap) -> u16 {
    match map {
        CIDToGIDMap::Identity => cid,
        CIDToGIDMap::Stream(data) => {
            let offset = (cid as usize) * 2;
            if offset + 1 < data.len() {
                u16::from_be_bytes([data[offset], data[offset + 1]])
            } else {
                0 // .notdef
            }
        }
    }
}
```

### 4.7 CID 0 の規則

すべてのCIDFontは**CID 0のグリフを必ず定義**しなければならない。
- 文字が見つからない場合のフォールバック（`.notdef`）として使用
- 通常は四角形の「豆腐文字」(□) として表示

## 5. フォント記述子（FontDescriptor）

フォントの詳細なメトリクス情報と埋め込みフォントデータを保持する辞書。

```
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
|:-----|:---|:-----|
| `/Type` | 名前 | `/FontDescriptor` |
| `/FontName` | 名前 | フォントのPostScript名 |
| `/Flags` | 整数 | フォント特性フラグ（ビットフィールド） |
| `/FontBBox` | 配列 | 全グリフのバウンディングボックス |
| `/ItalicAngle` | 実数 | 斜体角度（度単位、0 = 直立） |
| `/Ascent` | 実数 | アセンダ値（ベースライン上の高さ） |
| `/Descent` | 実数 | ディセンダ値（ベースライン下の深さ、負の値） |
| `/CapHeight` | 実数 | 大文字の高さ |
| `/StemV` | 実数 | 垂直ステムの太さ |
| `/FontFile` | ストリーム | Type 1フォントプログラム |
| `/FontFile2` | ストリーム | TrueType/OpenTypeフォントプログラム |
| `/FontFile3` | ストリーム | CFF/OpenType CFF フォントプログラム |

### 5.2 フォントフラグ（ビットフィールド）

| ビット | 値 | 意味 |
|:-------|:---|:-----|
| 1 | 1 | FixedPitch（等幅フォント） |
| 2 | 2 | Serif（セリフ体） |
| 3 | 4 | Symbolic（記号フォント） |
| 4 | 8 | Script（筆記体） |
| 6 | 32 | Nonsymbolic（非記号、ラテン文字ベース） |
| 7 | 64 | Italic（斜体） |
| 17 | 65536 | AllCap（すべて大文字） |
| 18 | 131072 | SmallCap（スモールキャップ） |
| 19 | 262144 | ForceBold（太字を強制） |

## 6. テキスト抽出と ToUnicode マッピング

### 6.1 テキスト抽出の課題

- 画面上では正しく表示されていても、ストリーム内のバイトコードは独自のCIDにマッピングされている
- 標準的なテキストとしてコピー＆ペーストできない場合がある
- PDFには「単語間のスペース」の明示的な概念が存在しない場合が多い

### 6.2 ToUnicode CMap

フォント辞書の `/ToUnicode` エントリに格納される特殊なCMap。

```
/CMapType 2 def
1 begincodespacerange
  <0000> <FFFF>
endcodespacerange

5 beginbfchar
  <0003> <0020>        % 文字コード0x0003 → U+0020 (スペース)
  <0010> <0048>        % 文字コード0x0010 → U+0048 ('H')
  <0011> <0065>        % 文字コード0x0011 → U+0065 ('e')
  <0012> <006C>        % 文字コード0x0012 → U+006C ('l')
  <0013> <006F>        % 文字コード0x0013 → U+006F ('o')
endbfchar

2 beginbfrange
  <0020> <007E> <0020> % 文字コード0x0020〜0x007E → U+0020〜U+007E
  <00A0> <00FF> <00A0> % 文字コード0x00A0〜0x00FF → U+00A0〜U+00FF
endbfrange
```

#### 処理フロー

```
描画パイプライン（グリフ表示用）:
  文字コード → CMap → CID → GID → グリフ描画

テキスト抽出パイプライン（意味取得用）:
  文字コード → /ToUnicode CMap → UTF-16 Unicodeコードポイント
```

### 6.3 ToUnicode が存在しない場合

1. `/Encoding` からグリフ名を取得
2. Adobe Glyph List (AGL) でグリフ名をUnicodeにマッピング
3. それでも失敗した場合、テキスト情報は**完全に失われる**
4. OCR（光学文字認識）のヒューリスティックに頼る以外に復元方法なし

### 6.4 単語境界の再構築

PDFにはスペースの明示的な表現がないため、パーサーは幾何学的な分析で推測する。

```
単語境界検出アルゴリズム:
1. 各グリフのバウンディングボックス（位置と幅）を計算
2. 連続するグリフ間の水平距離を測定
3. 距離がスペース文字の幅の一定割合（例: 30%）を超える場合、単語境界と判定
4. 垂直方向の位置変化が一定値を超える場合、行の境界と判定

fn detect_word_boundary(glyph1: &Glyph, glyph2: &Glyph, space_width: f64) -> bool {
    let gap = glyph2.x - (glyph1.x + glyph1.width);
    gap > space_width * 0.3
}
```

## 7. フォントサブセッティング

フォントファイル全体をPDFに埋め込むとファイルサイズが膨大になるため、使用するグリフのみを含む**サブセットフォント**を作成する。

### 7.1 サブセット識別子

```
/BaseFont /ABCDEF+ArialMT
```

- 6文字の大文字アルファベット + `+` + フォント名
- プレフィックスはランダムに生成される
- サブセット化されたフォントであることを示す慣例的な命名規則

### 7.2 実装上の注意

- サブセット化されたフォントでは、未使用のグリフは含まれない
- `/ToUnicode` CMapがない場合、サブセット化されたフォントのテキスト抽出は極めて困難
- フォント編集（テキスト追加等）を行う場合、元のフォントファイルが必要になる場合がある
