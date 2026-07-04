# XRef Stream Decoder

解凍済み xref ストリームデータからエントリをデコードし、`XRefTable` を返すモジュール。

## PDF仕様解説

### xref ストリームの役割（ISO 32000-1 §7.5.8）

xref ストリームは PDF 1.5 で導入された相互参照テーブルのバイナリ形式。テキスト形式の xref テーブルと同じ役割を持つが、ストリームオブジェクト内にバイナリデータとして格納される。ストリームオブジェクトの辞書部分に `/Type /XRef` を持つ。

導入の背景:
- ファイルサイズ削減（バイナリ形式 + 圧縮対応）
- Type 2 エントリによるオブジェクトストリーム内オブジェクトの参照が可能

### xref ストリーム辞書の必須エントリ

| キー | 型 | 必須 | 説明 |
|:-----|:---|:-----|:-----|
| `/Type` | 名前 | 必須 | 常に `/XRef` |
| `/Size` | 整数 | 必須 | テーブル内の最大オブジェクト番号 + 1 |
| `/W` | 配列 | 必須 | 各フィールドのバイト幅 `[w0, w1, w2]` |
| `/Index` | 配列 | 任意 | サブセクション範囲 `[firstObj count ...]`。省略時 `[0 Size]` |
| `/Prev` | 整数 | 任意 | 前の xref セクションのバイトオフセット |

### /W 配列によるフィールド定義

`/W [w0 w1 w2]` — 各エントリは `w0 + w1 + w2` バイトで構成される。各フィールドはビッグエンディアン符号なし整数としてデコードする。

| フィールド | バイト幅 | Type 0 (フリー) | Type 1 (通常) | Type 2 (圧縮) |
|:-----------|:---------|:----------------|:-------------|:-------------|
| Type | w0 | 0 | 1 | 2 |
| Field2 | w1 | 次のフリーobj番号 | バイトオフセット | 親ストリームobj番号 |
| Field3 | w2 | 世代番号 | 世代番号 | ストリーム内インデックス |

具体的なバイト列の例:

```
/W [1 3 1] の場合、1エントリ = 5バイト:
+------+---------+---------+
| Type | Field2  | Field3  |
| 1B   | 3B      | 1B      |
+------+---------+---------+
例: 01 00 00 09 00
    Type=1, offset=9, gen=0 → XRefUsedEntry { type:1, offset:9, gen:0 }
```

### デフォルト値ルール

| 条件 | デフォルト値 | 根拠 |
|:-----|:------------|:-----|
| w0=0（Type フィールド省略） | Type = 1（通常オブジェクト） | ISO 32000-1 Table 18 |
| w1=0（Field2 フィールド省略） | Field2 = 0 | フィールド幅 0 は値 0 として扱う |
| w2=0（Field3 フィールド省略） | Field3 = 0 | ISO 32000-1 Table 18 |

構造デコードのみを行い、意味論的検証は上位の責務とする。例: Type 2 で streamObject=0 は構造上デコード成功とする。

### /Index 配列によるサブセクション

`/Index [firstObj count firstObj count ...]` のペア列形式で、ストリームに含まれるオブジェクト範囲を指定する。省略時のデフォルトは `[0 Size]`。

```
/Size 20  /Index [0 5 10 3]
→ サブセクション1: オブジェクト 0〜4 (5個)
  サブセクション2: オブジェクト 10〜12 (3個)
  合計8エントリ分のデータがストリームに格納される
```

ストリームデータ内のエントリ順序は /Index のペア順に連続して配置される。

### テキスト形式 xref との対応表

| 観点 | テキスト形式 (xref table) | ストリーム形式 (xref stream) |
|:-----|:------------------------|:---------------------------|
| 格納場所 | プレーンテキスト | ストリームオブジェクト内バイナリ |
| エントリ幅 | 固定 20 バイト | /W 配列で可変 |
| 圧縮 | 不可 | FlateDecode 等で圧縮可能 |
| Type 2 サポート | なし | あり（オブジェクトストリーム内エントリ） |
| trailer | 別セクション | ストリーム辞書に統合 |

## 実装解説

### decodeXRefStreamEntries 関数

**入力**: `XRefStreamParams`（下記の入力型を参照）
**出力**: 成功時は `XRefTable`、失敗時は `PdfParseError` を Err で返す

内部 API であり、`@pdfmod/core` からは直接 import しない。解凍済みバイト列のデコードのみを担当し、辞書解析・`/Type /XRef` 検証・ストリーム展開・trailer 抽出は上位の `parseXRefStream` が担当する。

### XRefStreamParams 入力型

| フィールド | 型 | 必須 | 説明 |
|:-----------|:---|:-----|:-----|
| data | バイト列 | 必須 | 解凍済みストリームバイト列 |
| w | 整数 3 要素の配列 | 必須 | `/W` 配列（各フィールドのバイト幅） |
| size | 整数 | 必須 | `/Size` 値 |
| index | 整数の配列 | 任意 | `/Index` 配列（省略可） |
| baseOffset | バイトオフセット(ByteOffset) | 任意 | ストリームのPDFファイル内開始オフセット（エラー報告用、省略時は0） |

### 処理アルゴリズム

1. **入力バリデーション**
   - /W 配列: 各要素が非負安全整数
   - size: 非負安全整数
   - entryWidth (`w[0]+w[1]+w[2]`): 安全整数であること
2. **サブセクション解決**
   - /Index 省略時は `[0, size]` をデフォルトとする
   - /Index 配列: 偶数長、各 firstObj と count が非負安全整数、`firstObj + count <= size`
   - totalEntries（各 count の合計）: 安全整数であること
3. **データ長チェック**
   - `data.length === totalEntries * entryWidth`（expectedBytes も安全整数であること）
4. **エントリデコードループ**
   - 各サブセクションの各エントリについて `decodeIntBE` で 3 フィールドを読み取り
   - Type 別に XRefEntry（FreeEntry / UsedEntry / CompressedEntry）を構築
   - ブランド型 `create()` でバリデーション
   - `Map<ObjectNumber, XRefEntry>` に追加（重複キーは後勝ち）
5. **結果返却**
   - `Ok({ entries, size })`

### 内部ヘルパー関数

**decodeIntBE** — ビッグエンディアン符号なし整数デコード。幅 0 は値 0 を返す。`Number.MAX_SAFE_INTEGER` 超過で Err。

```
function decodeIntBE(data, offset, width):
  if width === 0: return Ok(0)
  value = 0
  for i in 0..width-1:
    value = value * 256 + data[offset + i]
  if value > MAX_SAFE_INTEGER: return Err(...)
  return Ok(value)
```

**decodeEntry** — 1 エントリのデコード。デフォルト値適用 → Type 分岐 → ブランド型バリデーション。

**failXRefStream** — エラー生成ヘルパー。`message` + オプショナルな `offset`（`baseOffset` + エントリ内相対位置から算出した PDF ファイル内絶対バイトオフセット）を含む。

## エラーケースと Result 型

すべてのエラーは `throw` せず `Err({ code: "XREF_STREAM_INVALID", message, offset? })` で返す。

| ケース | エラーメッセージ例 | 検出タイミング |
|:-------|:-----------------|:-------------|
| /W 配列に負の値・非整数・非安全整数 | `"/W array element must be non-negative safe integer"` | 入力バリデーション |
| size が負数・非整数・非安全整数 | `"invalid /Size value"` | 入力バリデーション |
| entryWidth が非安全整数 | `"entry width exceeds safe integer range"` | 入力バリデーション |
| /Index 配列の要素数が奇数 | `"/Index array must have even number of elements"` | サブセクション解決 |
| /Index の firstObj が不正 | `"/Index firstObj must be non-negative safe integer"` | サブセクション解決 |
| /Index の count が不正 | `"/Index count must be non-negative safe integer"` | サブセクション解決 |
| firstObj + count > size | `"/Index range exceeds /Size"` | サブセクション解決 |
| totalEntries が非安全整数 | `"total entry count exceeds safe integer range"` | サブセクション解決 |
| expectedBytes が非安全整数 | `"expected data length exceeds safe integer range"` | データ長チェック |
| データ長不一致 | `"stream data length mismatch: expected N, got M"` | データ長チェック |
| 不明な Type 値 | `"unknown xref entry type: N"` | エントリデコード |
| decodeIntBE オーバーフロー | `"decoded integer exceeds safe integer range"` | エントリデコード |
| ブランド型バリデーション失敗 | `"invalid ObjectNumber/ByteOffset/GenerationNumber: ..."` | エントリデコード |

## 上位モジュールとの関係

### parseXRefStream API との関係

```
scanStartXRef  -->  parseXRefTable   -->  TrailerParser  -->  ObjectStore
                    parseXRefStream  -->  (trailer は辞書に統合)
                         |
                         v
                    decodeXRefStreamEntries  ← 本モジュール
```

- `parseXRefStream` はストリームオブジェクト全体のパース（辞書解析・`/Type /XRef` 検証・ストリーム展開）を行い、内部で `decodeXRefStreamEntries` を呼ぶ
- `decodeXRefStreamEntries` は解凍済みデータのデコードに特化した低レベル関数であり、単体テストしやすい設計

### XRefMerger との統合

- xref ストリームは `/Prev` キーで前の xref セクションを参照でき、インクリメンタルアップデートに対応
- `XRefMerger` が複数の xref テーブル/ストリームを `/Prev` チェーンで辿り統合する（[xref-merger-spec.md](./xref-merger-spec.md)）
