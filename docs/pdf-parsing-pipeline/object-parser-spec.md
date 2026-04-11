# PDF解析パイプライン - ObjectParser 仕様

> **機能**: [PDF解析パイプライン](./index.md)
> **ステータス**: 下書き

## 概要

Token列を PdfObject に変換する汎用パーサー。`parse(data, offset)` でバイト列から PdfObject を1つパースし、`parseIndirectObject(data, offset, resolveLength?)` で間接オブジェクト定義（`N G obj ... endobj`）をパースする。

ISO 32000-1:2008 の以下のセクションに基づく:
- §7.3 オブジェクト — プリミティブ9型の定義
- §7.3.8 ストリームオブジェクト — stream/endstream 構文
- §7.3.10 間接オブジェクト — obj/endobj 構文、間接参照（`N G R`）

## 関連仕様

- [object-resolver-spec.md](./object-resolver-spec.md) — ObjectParser/ObjectResolver の全体像（OP-001〜OP-009）
- [error-handling-spec.md](./error-handling-spec.md) — エラー型定義

## トークン → PdfObject 変換ルール

### プリミティブ（トークン）型

| トークン型 | PdfObject 型 | 変換 |
|:-----------|:-------------|:-----|
| `Null` | `{ type: "null" }` | そのまま |
| `Boolean` | `{ type: "boolean", value }` | トークン value をそのまま使用 |
| `Integer` | `{ type: "integer", value }` | トークン value をそのまま使用（※ indirect-ref 先読みあり） |
| `Real` | `{ type: "real", value }` | トークン value をそのまま使用 |
| `Name` | `{ type: "name", value }` | トークン value をそのまま使用 |
| `LiteralString` | `{ type: "string", value: Uint8Array, encoding: "literal" }` | 文字列をバイト列に変換 |
| `HexString` | `{ type: "string", value: Uint8Array, encoding: "hex" }` | 16進文字列をバイト列に変換 |

### NaN な数値トークンの拒否

Tokenizer が `.`、`+`、`-` 単独を NaN な Integer/Real トークンとして返す場合がある。ObjectParser はこれを `OBJECT_PARSE_UNEXPECTED_TOKEN` エラーとして拒否する。

### indirect-ref 検出（Integer Integer R）

Integer トークンを受け取った際の 3 トークン先読みロジック:

1. `next()` で 2nd トークンを取得
2. 2nd が Integer なら `next()` で 3rd トークンを取得
3. 3rd が `Keyword("R")` なら `{ type: "indirect-ref", objectNumber, generationNumber }` を返す
4. 3rd が `Keyword("R")` でなければ `pushBack(3rd)`, `pushBack(2nd)`, Integer を返す
5. 2nd が Integer でなければ `pushBack(2nd)`, Integer を返す

pushBack の順序が重要: 後に pushBack したものが先に pop される（スタック）。

### 配列パース

`[` トークン検出後、`]` トークンまで再帰的に PdfObject を収集する。

### 辞書パース

`<<` トークン検出後、`>>` トークンまで Name-Value ペアを収集し `Map<string, PdfObject>` に格納する。キーは Name トークンでなければ `OBJECT_PARSE_UNEXPECTED_TOKEN` エラー。

### ネスト深度制限

配列・辞書のネストが 100 段を超えた場合、`NESTING_TOO_DEEP` エラーを返す（DoS 防止）。

## stream/endstream 処理

### parse() での stream 検出

`parse()` で辞書をパースした直後に次トークンが `Keyword("stream")` の場合、ストリームオブジェクトとして処理する。ただし `/Length` が直値（integer）の場合のみ対応。`/Length` が間接参照の場合は `OBJECT_PARSE_STREAM_LENGTH` エラーを返す（間接参照の解決は `parseIndirectObject` 側の責務）。

### stream キーワード後の改行規則

ISO 32000-1:2008 §7.3.8.1 より、`stream` キーワードの後は:
- `LF (0x0A)` → `streamStart = position + 1`
- `CR (0x0D)` + `LF (0x0A)` → `streamStart = position + 2`
- `CR` 単独は不可 → `OBJECT_PARSE_STREAM_LENGTH` エラー

Tokenizer は keyword 後の改行を消費しないため、生バイトを直接検査する。

### /Length の取得

1. 辞書の `/Length` エントリを取得
2. `/Length` が `{ type: "integer" }` → その value を直接使用
3. `/Length` が `{ type: "indirect-ref" }` → `resolveLength(objNum, genNum)` を呼び出し
   - `resolveLength` が未提供 → `Err(OBJECT_PARSE_STREAM_LENGTH)`
   - `resolveLength` がエラーを返した → `Err(OBJECT_PARSE_STREAM_LENGTH)`（元エラーの情報は message に畳み込み）
4. `/Length` が存在しない or 上記以外の型 → `Err(OBJECT_PARSE_STREAM_LENGTH)`

### /Length の値域検証

- `Number.isSafeInteger(length) && length >= 0` を満たすこと
- 違反時は `OBJECT_PARSE_STREAM_LENGTH` エラー
- `streamStart + length > data.length` の場合もエラー

### endstream の検証

`streamStart + length` の位置にはストリームデータ終端の改行（LF または CRLF）があることを期待し、その改行を消費した直後に `endstream` キーワードが続くことを raw byte で検証する（strict モード、Tokenizer は使わずコメントや追加空白は許容しない）。

## obj/endobj 構文（間接オブジェクト定義）

`parseIndirectObject(data, offset, resolveLength?)` の処理:

1. Integer Integer Keyword("obj") のヘッダを読み取り → objNum, genNum を取得
2. 本体は `parse()` をそのまま呼ぶのではなく、`parseIndirectObject` 内で `readValue` により値を1つ読み取る
3. 読み取った本体が dictionary の場合は、その直後に `Keyword("stream")` が続くかを `parseIndirectObject` 側で判定し、続く場合のみストリーム処理を行う
4. ストリーム処理の有無にかかわらず、最後に `Keyword("endobj")` を確認する

> 注: `parseIndirectObject()` の本体読み取り・`stream` 判定は `parse()` の単純なラッパーではない。したがって `/Length` の扱い（`parse()` は indirect `/Length` をエラーにする一方、`parseIndirectObject()` は `resolveLength` コールバックで解決する）など、`parse()` 単体の仕様と完全には一致しない。

## エラーコード一覧

| コード | 発生条件 |
|:-------|:---------|
| `OBJECT_PARSE_UNEXPECTED_TOKEN` | 予期しないトークン（不正な構文、辞書キーが Name でない、NaN 数値） |
| `OBJECT_PARSE_UNTERMINATED` | 配列・辞書・obj・stream が閉じられていない（EOF 到達） |
| `OBJECT_PARSE_STREAM_LENGTH` | /Length が取得できない（間接参照で resolveLength 未提供、resolveLength エラー、値域不正、データ範囲超過） |
| `NESTING_TOO_DEEP` | 配列・辞書のネストが 100 段超 |

## offset の定義

`parse(data, offset)` および `parseIndirectObject(data, offset, ...)` の `offset` は、渡された `Uint8Array data` に対する相対位置。内部では `data.subarray(offset)` → `new Tokenizer(subData)` の形で使用する。

- 入力検証: `offset < 0 || offset >= data.length` の場合は `OBJECT_PARSE_UNEXPECTED_TOKEN` エラー
- エラー位置: `PdfParseError.offset` は呼び出し元の `data` 基準で返す（内部トークン offset + 開始 offset を加算）

## 今回非対応の仕様

- **SL-001〜SL-003**: `/Length` ずれ時の `endstream` 探索による回復処理
- **OR-006**: xref オフセットずれ時の前後探索による補正
- **STREAM_LENGTH_MISMATCH 警告**: `/Length` と実データ長の不一致警告
