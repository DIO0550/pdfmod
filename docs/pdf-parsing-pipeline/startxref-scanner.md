# StartXRef Scanner

> **上位目次**: [PDF解析パイプライン仕様](./index.md) / [xref 解析仕様（統括）](./xref-parser-spec.md)  
> **対応規格**: ISO 32000-1:2008 §7.5.5（[02. 物理ファイル構造 §5–§6](../specs/02_file_structure.md#5-トレイラ辞書trailer-dictionary)）  
> **実装ファイル**: `packages/core/src/xref/startxref/scanner/index.ts`

PDF ファイル末尾から `%%EOF` と `startxref` を逆方向スキャンし、xref テーブルの開始バイトオフセットを検出するモジュールです。

---

## PDF 仕様の要点

### `%%EOF` と `startxref` の構造

```pdf
... (ボディ — インダイレクトオブジェクト群) ...

xref                          % 相互参照テーブルの開始（例: offset 116）
0 6                           % サブセクション: オブジェクト 0 から 6 個
0000000000 65535 f
0000000009 00000 n
...
trailer
<< /Size 6 /Root 1 0 R >>
startxref
116                           % xref テーブルのバイトオフセット
%%EOF                         % ファイル終端マーカー
```

- **末尾からの逆方向解析**: 増分更新された PDF には `%%EOF` が複数存在するため、常に**最後の `%%EOF`** を起点とする。
- **1024 バイト範囲の根拠**: ISO 32000-1 §7.5.5 は末尾 1024 バイト以内に `%%EOF` が存在すべきと規定している（末尾のゴミデータを許容しつつ探索コストを抑えるため）。

---

## 実装仕様

### `scanStartXRef(data)`

- **入力**: PDF バイナリ全体（`Uint8Array`）
- **出力**: `Result<ByteOffset, PdfParseError>`（成功時は `startxref` 直後のオフセット値）

#### 処理アルゴリズム

1. **探索範囲の算出**: 末尾 1024 バイト（`max(0, data.length - 1024)`〜末尾）を対象にする。
2. **`%%EOF` 逆方向検索**: バイト列 `[0x25, 0x25, 0x45, 0x4F, 0x46]` を逆方向検索する（コメント行内のマッチは除外）。最後の `%%EOF` を検出する。
3. **`startxref` 逆方向検索**: 検出した `%%EOF` から先頭方向へ `"startxref"` を検索する。前後のトークン境界（ホワイトスペース・デリミタ・データ端）を検証し、コメント行内マッチを除外して最も `%%EOF` に近い候補を採用する。
4. **オフセット値パース**: `startxref` 末尾から `%%EOF` 手前までの空白・コメントを飛ばし、ASCII 数字列を安全整数（`Number.isSafeInteger`）として構築する。数字列と `%%EOF` の間に余分なゴミがないことも検証する。
5. **範囲検証**: 取得したオフセット値がファイル長未満であることを確認する。

#### エラーケース（エラーコード: `STARTXREF_NOT_FOUND`）

すべての失敗は `throw` せず `Err<PdfParseError>` で返します。

| ケース | エラーメッセージ |
| :--- | :--- |
| `%%EOF` が末尾スキャン範囲内に見つからない | `"%%EOF not found within last 1024 bytes"` |
| `startxref` キーワードが見つからない | `"startxref keyword not found before %%EOF"` |
| オフセット値が不正（数字がない・範囲外等） | `"invalid startxref offset value"` |

---

## 回復処理

### XR-003: スキャン範囲拡大

1. 末尾 1024 バイト以内に `%%EOF` が見つからない場合、**`scanStartXRef` 自身**が探索範囲を最大 **4096 バイト**まで拡大して再検索する。
2. 拡大で検出できた場合はオフセット値を `Ok` で返しつつ、**`EOF_NOT_FOUND` 警告**を発行する（`LoadOptions.onWarning` へ通知）。
3. 4096 バイトでも見つからない場合は `STARTXREF_NOT_FOUND` を `Err` で返す。

### XR-004: フォールバックスキャナ

`STARTXREF_NOT_FOUND` が返った場合、上位パイプラインはファイル全体から `N G obj` を走査するフォールバック XRef スキャナへ委譲します（[error-handling-spec.md](./error-handling-spec.md)）。

## パイプライン内の位置づけ

```text
scanStartXRef ──→ XRefTableParser / XRefStreamParser ──→ XRefMerger ──→ ObjectStore
```
