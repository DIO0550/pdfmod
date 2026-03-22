# StartXRef Scanner

PDFファイル末尾から `startxref` オフセット値を検出するモジュール。

## PDF仕様解説

### %%EOF と startxref の役割（ISO 32000-1 §7.5.5）

PDFはファイル末尾から逆方向に解析を開始する。末尾には以下の構造が存在する:

```
startxref
116          <-- xrefテーブルのバイトオフセット
%%EOF        <-- ファイル終端マーカー
```

- **%%EOF**: ファイル終端を示すマーカー。PDFリーダーはこれを起点に逆方向解析を開始する
- **startxref**: 直後の整数値がxrefテーブル（相互参照テーブル）のファイル先頭からのバイトオフセットを示す

### ファイル末尾構造の図解

```
... (ボディ — インダイレクトオブジェクト群) ...

xref                          <-- 相互参照テーブルの開始
0 6                           <-- サブセクション: オブジェクト0から6個
0000000000 65535 f
0000000009 00000 n
...
trailer
<< /Size 6 /Root 1 0 R >>
startxref
116                           <-- xrefテーブルのバイトオフセット
%%EOF
```

### インクリメンタルアップデートと複数%%EOF

PDFに変更を加える場合、元のファイルを書き換えず末尾に差分を追記する（インクリメンタルアップデート）:

```
[元のボディ] [元のxref] [元のtrailer] [元のstartxref] [元の%%EOF]
[追加ボディ] [新xref]   [新trailer]   [新startxref]   [新%%EOF]
```

`%%EOF` はファイル内に複数存在しうる。パーサーは最後の（最新の）`%%EOF` から解析を開始する。

### 1024バイトスキャン範囲の根拠

ISO 32000-1 §7.5.5 では「ファイルの最後の1024バイト以内に `%%EOF` が存在すべき」と規定。これは末尾にゴミデータが付加されたPDFを許容しつつ、効率的にスキャン開始位置を限定するため。

## 実装解説

### scanStartXRef 関数

```typescript
import type { Result } from "@pdfmod/core";
import type { PdfParseError } from "@pdfmod/core";

function scanStartXRef(data: Uint8Array): Result<number, PdfParseError>;
```

`Uint8Array` としてPDFバイナリ全体を受け取り、`startxref` 直後のオフセット値を `Result` 型で返す。

### 処理アルゴリズム

1. **末尾領域の算出**: `tailStart = Math.max(0, data.length - 1024)` で末尾1024バイトの `%%EOF` 検索開始位置を決定
2. **%%EOF 逆方向検索**: `tailStart` から末尾までの範囲でバイト列 `[0x25, 0x25, 0x45, 0x4F, 0x46]` を逆方向に検索。コメント行内のマッチは除外。最後の `%%EOF` を自動的に検出
3. **startxref 逆方向検索**: `%%EOF` の位置からファイル先頭に向かってバイト列 `"startxref"` を検索。前後両方のトークン境界チェック（ホワイトスペースまたはデリミタまたはデータ端）を行い、コメント行内のマッチも除外。最も `%%EOF` に近い有効な候補を採用し、数字の有無は次のステップで判定
4. **オフセット値パース**: `startxref` キーワード末尾から `%%EOF` 位置までの範囲でホワイトスペース/コメントをスキップし、連続するASCII数字を逐次的に数値構築（`Number.isSafeInteger` でオーバーフロー検出）。数字列後に `%%EOF` までの間にゴミがないことも検証
5. **バリデーション**: パースしたオフセット値がファイル長未満であることを確認

### エラーケースとResult型

すべてのエラーは `throw` せず `Result` 型（`Err<PdfParseError>`）で返す:

| ケース | エラーメッセージ |
|:-------|:-----------------|
| `%%EOF` が末尾1024バイト内に見つからない | `"%%EOF not found within last 1024 bytes"` |
| `startxref` キーワードが見つからない | `"startxref keyword not found before %%EOF"` |
| オフセット値が不正（数字がない） | `"invalid startxref offset value"` |

エラーコードはすべて `"STARTXREF_NOT_FOUND"` を使用。

### コード例

```typescript
import { scanStartXRef } from "@pdfmod/core";

const pdfData = new Uint8Array(buffer);
const result = scanStartXRef(pdfData);

if (result.ok) {
  console.log("xref offset:", result.value);
  // result.value を使ってxrefテーブルの位置にジャンプ
} else {
  console.error(result.error.message);
}
```

## 今後の拡張

### XR-003: スキャン範囲拡大（Issue #27）

実世界のPDFでは %%EOF が末尾1024バイトを超える位置にある場合がある。XR-003 では最大4096バイトまでスキャン範囲を拡大し、`PdfWarning`（`EOF_NOT_FOUND`）を発行しつつ回復的に処理する。`scanStartXRef` の第2引数としてオプション（`{ maxScanBytes?: number }`）を追加する設計を想定。

### XR-004: フォールバックスキャナ（別Issue）

%%EOF や startxref が破損している場合のフォールバック戦略。ファイル全体を走査して xref テーブルの開始位置を直接検出する。

### 他のxrefモジュールとの関係

```
scanStartXRef  -->  XRefTableParser  -->  ObjectResolver
                    XRefStreamParser
```

`scanStartXRef` は PDF解析パイプラインの最初のステップ。返されたオフセット値を使って `XRefTableParser`（従来形式）または `XRefStreamParser`（PDF 1.5+ のxrefストリーム形式）がxrefデータを読み取る。
