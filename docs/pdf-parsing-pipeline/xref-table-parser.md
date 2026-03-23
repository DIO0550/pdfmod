# XRef Table Parser

テキスト形式の xref テーブルを解析し、`XRefTable` と `trailerOffset` を返すモジュール。

## PDF仕様解説

### xref テーブルの役割（ISO 32000-1 §7.5.4）

xref テーブル（相互参照テーブル）は、PDF ファイル内の各間接オブジェクトのバイトオフセットを管理する索引構造。PDF リーダーはこのテーブルを使って、オブジェクト番号からファイル内の物理位置へ直接ジャンプする。

```
startxref が指す位置
    |
    v
xref                              <-- xref キーワード
0 6                               <-- サブセクションヘッダ: オブジェクト0から6個
0000000000 65535 f \r\n           <-- エントリ (18バイト本体 + EOL)
0000000009 00000 n \r\n
0000000074 00000 n \r\n
0000000120 00000 n \r\n
0000000179 00000 n \r\n
0000000322 00000 n \r\n
trailer                           <-- trailer キーワード（xref テーブルの終端）
<< /Size 6 /Root 1 0 R >>
```

### エントリ形式（18バイト本体 + EOL）

各 xref エントリは固定幅の 18 バイト本体と EOL で構成される:

```
nnnnnnnnnn ggggg T
|          |     |
|          |     +-- ステータスフラグ: 'n'(使用中) or 'f'(空き)
|          +-------- 世代番号 (5桁ゼロ埋め)
+------------------- バイトオフセット (10桁ゼロ埋め, type=n の場合)
                     or 次の空きオブジェクト番号 (type=f の場合)
```

ISO 32000 では 20 バイト固定長（本体 18 + CR+LF 2）を規定するが、実際の PDF では EOL バリエーションが存在する:

| EOL パターン | バイト列 | 合計サイズ | 出現状況 |
|:------------|:---------|:----------|:---------|
| CR+LF | 0x0D 0x0A | 20バイト | ISO 32000 標準 |
| LF のみ | 0x0A | 19バイト | Unix 系 PDF ライタ |
| CR+SP | 0x0D 0x20 | 20バイト | 一部の非準拠 PDF ライタ |
| CR のみ | 0x0D | 19バイト | 古い Mac 系 |

### サブセクションの仕組み

xref テーブルは複数のサブセクションを持つことができる。各サブセクションは「開始オブジェクト番号」と「エントリ数」のヘッダで始まる:

```
xref
0 3                    <-- オブジェクト 0, 1, 2
0000000000 65535 f
0000000009 00000 n
0000000074 00000 n
8 2                    <-- オブジェクト 8, 9（不連続）
0000000322 00000 n
0000000450 00000 n
trailer
```

インクリメンタルアップデートで変更されたオブジェクトのみを新しいサブセクションに記録することで、ファイル全体の書き換えを回避する。

### オブジェクト 0 と空きオブジェクトチェーン

オブジェクト 0 は常に空きオブジェクトチェーンの先頭として予約される。世代番号は 65535（最大値）で、`f` フラグが設定される:

```
0000000000 65535 f    <-- オブジェクト 0: 次の空きオブジェクト番号=0, gen=65535
```

`f` エントリの offset フィールドは「次の空きオブジェクト番号」を示し、空きオブジェクトのリンクリストを形成する。チェーンの末端はオブジェクト 0 を指す（循環）。

### trailer キーワードとの境界

xref テーブルの終端は `trailer` キーワードで示される。パーサーはサブセクションヘッダの読み取り位置で `trailer` を検出するとテーブルの解析を終了し、その位置を `trailerOffset` として返す。

## 実装解説

### parseXRefTable 関数

```typescript
import type { Result } from "@pdfmod/core";
import type { PdfParseError, ByteOffset, XRefTable } from "@pdfmod/core";

function parseXRefTable(
  data: Uint8Array,
  offset: ByteOffset,
): Result<{ xref: XRefTable; trailerOffset: ByteOffset }, PdfParseError>;
```

`Uint8Array` として PDF バイナリ全体と、`startxref` から取得した xref テーブルの開始オフセットを受け取る。

### 処理アルゴリズム

1. **入力境界チェック**: `offset < 0` または `offset >= data.length` ならエラーを返す
2. **xref キーワード確認**: 指定位置で `"xref"` バイト列を検証。不一致ならエラー
3. **空白スキップ**: `skipWhitespaceAndComments` で xref 後の空白・コメントをスキップ
4. **サブセクションループ**:
   - `trailer` キーワードを検出 → ループ終了、`trailerOffset` を記録
   - サブセクションヘッダ `{firstObj} {count}` をパース
   - `count` 個のエントリをパース（18バイト本体 + EOL 検出）
   - 各エントリを `Map<number, XRefEntry>` に格納
   - `size` を `max(size, firstObj + count)` で更新
5. **結果返却**: `Ok({ xref: { entries, size }, trailerOffset })`

### エラーケースと Result 型

すべてのエラーは `throw` せず `Result` 型（`Err<PdfParseError>`）で返す。エラーコードはすべて `"XREF_TABLE_INVALID"` を使用:

| ケース | エラーメッセージ |
|:-------|:-----------------|
| オフセットが範囲外 | `"xref offset out of bounds"` |
| xref キーワード不在 | `"expected 'xref' keyword"` |
| サブセクションヘッダの数値不正 | `"xref subsection header: expected object number"` |
| エントリ本体が 18 バイト未満 | `"xref entry truncated: insufficient data for 18-byte body"` |
| offset/generation 間の区切りが不正 | `"xref entry: expected SPACE after offset"` |
| 不正な状態フラグ | `"xref entry: invalid status flag 'x', expected 'n' or 'f'"` |
| 未知の EOL パターン | `"xref entry: unknown EOL pattern"` |
| trailer キーワード未検出 | `"trailer keyword not found"` |

### コード例

```typescript
import { scanStartXRef, parseXRefTable } from "@pdfmod/core";
import type { ByteOffset } from "@pdfmod/core";

const pdfData = new Uint8Array(buffer);

// Step 1: startxref オフセットを取得
const startxrefResult = scanStartXRef(pdfData);
if (!startxrefResult.ok) {
  console.error(startxrefResult.error.message);
  return;
}

// Step 2: xref テーブルをパース
const xrefResult = parseXRefTable(
  pdfData,
  startxrefResult.value as ByteOffset,
);
if (!xrefResult.ok) {
  console.error(xrefResult.error.message);
  return;
}

const { xref, trailerOffset } = xrefResult.value;
console.log(`entries: ${xref.entries.size}, size: ${xref.size}`);
console.log(`trailer starts at: ${trailerOffset}`);
```

## 今後の拡張

### 他の xref モジュールとの関係

```
scanStartXRef  -->  parseXRefTable   -->  TrailerParser  -->  ObjectResolver
                    XRefStreamParser
                          |
                          v
                    XRefMerger (複数 xref テーブルの統合)
```

- **XRefStreamParser**: PDF 1.5+ の xref ストリーム形式を解析する。`parseXRefTable` と同じ `XRefTable` を返す
- **TrailerParser**: `trailerOffset` を使って trailer 辞書を解析し、`/Size`, `/Root`, `/Prev` 等を取得する
- **XRefMerger**: インクリメンタルアップデートで生成された複数の xref テーブルを `/Prev` チェーンで辿り、統合する。オブジェクト 0 の検証もここで実施する
