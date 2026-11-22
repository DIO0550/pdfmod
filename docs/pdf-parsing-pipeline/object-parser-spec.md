# PDF解析パイプライン - ObjectParser 仕様

> **上位目次**: [PDF解析パイプライン仕様](./index.md)  
> **対応規格**: ISO 32000-1:2008 §7.3, §7.3.8, §7.3.10  
> **関連仕様**: [オブジェクト解決仕様（OP-001〜OP-009）](./object-resolver-spec.md) / [エラーハンドリング仕様](./error-handling-spec.md) / [01. レキシカル規約](../specs/01_lexical_conventions.md)

## 概要

Token 列を `PdfObject` に変換する汎用パーサです。

| 操作 | 対象 | `/Length` が間接参照のとき |
| :--- | :--- | :--- |
| `parse(data, offset)` | 単体の PDF オブジェクト（直接オブジェクト、および `/Length` が直値整数のストリーム） | `OBJECT_PARSE_STREAM_LENGTH` エラー |
| `parseIndirectObject(data, offset, resolveLength?)` | 間接オブジェクト定義（`N G obj ... endobj`、ストリーム含む） | `resolveLength` コールバックで解決 |

> `parseIndirectObject()` の本体読み取りと `stream` 判定は `parse()` の単純ラッパーではなく、内部の `readValue` で値を 1 つ読んだ直後に `stream` を判定して `resolveLength` を使います。

---

## トークン → `PdfObject` 変換ルール

### プリミティブ（トークン）型

| トークン型 | `PdfObject` 型 | 変換 |
| :--- | :--- | :--- |
| `Null` | `{ type: "null" }` | そのまま |
| `Boolean` | `{ type: "boolean", value }` | トークン `value` を使用 |
| `Integer` | `{ type: "integer", value }` | トークン `value` を使用（※ `indirect-ref` 先読みあり） |
| `Real` | `{ type: "real", value }` | トークン `value` を使用 |
| `Name` | `{ type: "name", value }` | トークン `value` を使用 |
| `LiteralString` | `{ type: "string", value: Uint8Array, encoding: "literal" }` | リテラル文字列をバイト列へデコード |
| `HexString` | `{ type: "string", value: Uint8Array, encoding: "hex" }` | 16 進文字列をバイト列へデコード |

### NaN 数値トークンの拒否

Tokenizer が `.`・`+`・`-` 単独を `NaN` 数値トークンとして返した場合、ObjectParser は `OBJECT_PARSE_UNEXPECTED_TOKEN` エラーとして拒否します。

### 間接参照の検出（`Integer Integer R`）

`Integer` トークンを受け取った際は 3 トークン先読みで間接参照を判定します。

1. 2 番目のトークンを先読みする。`Integer` でなければ `pushBack(2nd)` して最初の `Integer` を返す。
2. 3 番目のトークンを先読みする。
3. 3 番目が `Keyword("R")` なら `{ type: "indirect-ref", objectNumber, generationNumber }` を返す（`objectNumber == 0` は [02a章 §2.4](../specs/02a_object_resolution.md#24-解決フロー) に従い `null` に畳む）。
4. `Keyword("R")` でなければ `pushBack(3rd)` → `pushBack(2nd)` の順（スタック構造なので逆順）に巻き戻し、最初の `Integer` を返す。

### 配列・辞書パースとネスト深度制限

- **配列**: `[` を検出したら `]` まで再帰的に `PdfObject` を収集する。
- **辞書**: `<<` を検出したら `>>` まで `Name`–`Value` ペアを収集してマップに格納する。キーが `Name` トークンでなければ `OBJECT_PARSE_UNEXPECTED_TOKEN` エラー。
- **ネスト深度制限**: 配列・辞書のネストが **100 段**を超えた場合、DoS 防止のため `NESTING_TOO_DEEP` エラーを返す。

---

## `stream` / `endstream` 処理

### `stream` キーワード直後の改行規則（ISO 32000-1 §7.3.8.1）

Tokenizer はキーワード後の改行を消費しないため、生バイトを直接検査します。

| 直後のバイト列 | 扱い |
| :--- | :--- |
| `LF (0x0A)` | `streamStart = position + 1` |
| `CR (0x0D) + LF (0x0A)` | `streamStart = position + 2` |
| `CR` 単独・その他 | 不可（`OBJECT_PARSE_STREAM_LENGTH` エラー） |

### `/Length` の取得と値域検証

1. 辞書の `/Length` を参照する。
   - `integer`: その `value` を直接使用。
   - `indirect-ref`: `resolveLength(objNum, genNum)` を呼び出す（未提供またはエラー返却時は元情報をメッセージへ畳み込んで `OBJECT_PARSE_STREAM_LENGTH`）。
   - 不在・その他の型: `OBJECT_PARSE_STREAM_LENGTH` エラー。
2. 値域検証: `Number.isSafeInteger(length) && length >= 0`、かつ `streamStart + length <= data.length` を満たさない場合は `OBJECT_PARSE_STREAM_LENGTH` エラー。

### `endstream` の検証

`streamStart + length` の位置にあるストリーム終端の改行（LF または CRLF）を消費した直後に `endstream` キーワードが続くことを、生バイト比較で厳密に検証します（コメントや追加空白は許容しません）。

---

## `obj` / `endobj` 構文（間接オブジェクト定義）

`parseIndirectObject(data, offset, resolveLength?)` の処理手順です。

1. `Integer` `Integer` `Keyword("obj")` のヘッダを読み取り、`objNum`・`genNum` を取得する。
2. `readValue` でオブジェクト本体を 1 つ読み取る。
3. 本体が辞書であり、直後に `Keyword("stream")` が続く場合のみストリーム処理を行う。
4. ストリームの有無にかかわらず、最後に `Keyword("endobj")` を確認する。

---

## エラーコード一覧と `offset` の定義

| コード | 発生条件 |
| :--- | :--- |
| `OBJECT_PARSE_UNEXPECTED_TOKEN` | 予期しないトークン（不正構文、辞書キーが `Name` でない、`NaN` 数値、開始 `offset` が範囲外） |
| `OBJECT_PARSE_UNTERMINATED` | 配列・辞書・`obj`・`stream` が閉じられないまま EOF 到達 |
| `OBJECT_PARSE_STREAM_LENGTH` | `/Length` が確定できない（間接参照で `resolveLength` 未提供・失敗、値域不正、データ範囲超過、`stream` 後改行不正） |
| `NESTING_TOO_DEEP` | 配列・辞書のネストが 100 段超 |

### `offset` の基準

- `parse(data, offset)` / `parseIndirectObject(data, offset, ...)` の `offset` は渡された `data` に対する相対位置です。
- `offset < 0 || offset >= data.length` の場合は `OBJECT_PARSE_UNEXPECTED_TOKEN` を返します。
- `PdfParseError.offset` は呼び出し元の `data` 基準の絶対位置（内部トークン位置 + 開始 `offset`）で返します。
