# Rust `PdfError` の型別文脈（Issue #394）

## 現在の差

| 事象 | TS のフィールド | Rust の現状 |
| --- | --- | --- |
| パース | `offset?` | `position: Option<ByteOffset>` |
| 循環参照 | `objectId: ObjectId` | 対応コード・型付き文脈は未実装 |
| 型不一致 | `expected`, `actual` | 対応コード・型付き文脈は未実装 |

`message` は表示用であり、`format!` で埋めた値を再取得する API ではない。
参照: [`packages/core/src/pdf/errors/error/index.ts`](../../packages/core/src/pdf/errors/error/index.ts)、[`rust/crates/core/src/error/pdf_error.rs`](../../rust/crates/core/src/error/pdf_error.rs)。

## R2 以降の方針

`PdfErrorCode` は `Copy` 可能な分類タグとして維持する。公開エラーの内部に
private な判別 enum を置き、型不一致には `ObjectKind` の expected/actual、
循環参照には `ObjectId` を保持する。`code()` はその enum から導出し、
種別と文脈が食い違う状態を作れない構築経路にする。

下位の `ParseErrorKind` 等から公開 `PdfError` へ変換するときは、
利用者が分岐に必要な値を文字列に潰さず引き継ぐ。`Display` 用の文言と
型付き情報は別に扱う。

## R2 実装前に確認すること

1. `PdfError::new(PdfErrorCode)` に型付きデータ必須のコードを渡せないようにする
   移行方法と、既存の `new` 呼び出し・公開 API の互換性を決める。
2. `PdfErrorCode` にコードを追加する際、`code()` と `Display` の対応、
   `Clone` / `Eq`、位置情報の有無を定義する。
3. `ParseErrorKind` 等の変換ごとに、型付き値の保持をテストする。

この文書は将来の方針であり、現行 Rust API に型付き getter があることを意味しない。
