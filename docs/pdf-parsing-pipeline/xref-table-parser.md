# XRef Table Parser

> **上位目次**: [PDF解析パイプライン仕様](./index.md) / [xref 解析仕様（統括）](./xref-parser-spec.md)  
> **対応規格**: ISO 32000-1:2008 §7.5.4（[02. 物理ファイル構造 §4.1](../specs/02_file_structure.md#41-従来のテキストベースxrefテーブル)）  
> **実装ファイル**: `packages/core/src/xref/table/parser/index.ts`

テキスト形式の xref テーブルを解析し、`XRefTable` と `trailerOffset` を返すモジュールです。

---

## PDF 仕様の要点

### テキスト形式 xref の構造

```pdf
xref                              % xref キーワード（startxref が指す位置）
0 6                               % サブセクションヘッダ: 開始番号 0、エントリ数 6
0000000000 65535 f                % オブジェクト 0: 空きリストのヘッド
0000000009 00000 n                % オブジェクト 1: offset=9, gen=0, 使用中
0000000074 00000 n
...
trailer                           % xref テーブルの終端（trailerOffset）
<< /Size 6 /Root 1 0 R >>
```

### エントリ形式（18 バイト本体 + EOL）

```text
nnnnnnnnnn ggggg T
|          |     |
|          |     +-- ステータスフラグ: 'n'（使用中）または 'f'（空き）
|          +-------- 世代番号（5 桁ゼロ埋め）
+------------------- バイトオフセット（'n' 時）または次の空きオブジェクト番号（'f' 時、10 桁ゼロ埋め）
```

ISO 32000 は 20 バイト固定長（本体 18 + CR+LF 2）を規定しますが、実世界の PDF に合わせて次の EOL パターンを受理します。

| EOL パターン | バイト列 | 合計サイズ | 主な出現元 |
| :--- | :--- | :--- | :--- |
| CR+LF | `0x0D 0x0A` | 20 バイト | ISO 32000 標準 |
| LF のみ | `0x0A` | 19 バイト | Unix 系ライタ |
| CR+SP | `0x0D 0x20` | 20 バイト | 一部の非準拠ライタ |
| CR のみ | `0x0D` | 19 バイト | 古い Mac 系ライタ |

### サブセクションとオブジェクト 0

- 増分更新で変更された番号だけを記録できるよう、複数の不連続サブセクション（例: `0 3` の次に `8 2`）を持てる。
- オブジェクト 0 は常に世代 `65535`・フラグ `f` の空きリスト先頭として予約され、チェーン末尾は `0` を指す。
- テーブル終端は `trailer` キーワードで識別し、その位置を `trailerOffset` として返す。

---

## 実装仕様

### `parseXRefTable(data, offset)`

- **入力**: PDF バイナリ全体（`Uint8Array`）+ `startxref` から取得した xref 開始 `ByteOffset`
- **出力**: `Result<{ xref: XRefTable, trailerOffset: ByteOffset }, PdfParseError>`

#### 処理アルゴリズム

1. **境界チェック**: `offset < 0` または `offset >= data.length` ならエラー。
2. **`xref` キーワード確認**: 指定位置に `"xref"` が一致することを検証。
3. **空白・コメントスキップ**: `xref` キーワード直後のホワイトスペース・コメントをスキップ。
4. **サブセクションループ**:
   - `trailer` キーワードを検出したらループ終了し `trailerOffset` を記録。
   - サブセクションヘッダ `{firstObj} {count}` をパース。
   - `count` 個のエントリ（18 バイト本体 + EOL）を順にパースしてマップへ登録。
   - `size` を `max(size, firstObj + count)` で更新。
5. **結果返却**: `Ok({ xref: { entries, size }, trailerOffset })`。

#### エラーケース（エラーコード: `XREF_TABLE_INVALID`）

すべてのエラーは `throw` せず `Err<PdfParseError>` で返します。

| ケース | エラーメッセージ |
| :--- | :--- |
| オフセットが範囲外 | `"xref offset out of bounds"` |
| `xref` キーワード不在 | `"expected 'xref' keyword"` |
| サブセクションヘッダの数値不正 | `"xref subsection header: expected object number"` |
| エントリ本体が 18 バイト未満 | `"xref entry truncated: insufficient data for 18-byte body"` |
| offset / generation 間の区切り不正 | `"xref entry: expected SPACE after offset"` |
| 不正な状態フラグ | `"xref entry: invalid status flag 'x', expected 'n' or 'f'"` |
| 未知の EOL パターン | `"xref entry: unknown EOL pattern"` |
| `trailer` キーワード未検出 | `"trailer keyword not found"` |

## 関連モジュールとの関係

```text
scanStartXRef ──→ parseXRefTable ──→ TrailerParser ──→ XRefMerger ──→ ObjectStore
                  XRefStreamParser ─────────────────↗
```

- **`XRefStreamParser`**: PDF 1.5+ のストリーム形式を解析し、同じ `XRefTable` 型を返す。
- **`TrailerParser`**: `trailerOffset` から trailer 辞書を解析する。
- **`XRefMerger`**: `/Prev` チェーンで複数 xref を統合し、オブジェクト 0 を含む整合性を処理する。
