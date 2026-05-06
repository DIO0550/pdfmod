# 実装ドキュメント

`@pdfmod/core` 各モジュールの **実装側の動作・契約・既知制約** を記すドキュメント群。
仕様 (理想形) は [pdf-parsing-pipeline/](../pdf-parsing-pipeline/index.md) を参照。本フォルダは「実装が現時点で何をしていて、何をしていないか」を把握するためのリファレンス。

## ドキュメント一覧

| ドキュメント | 説明 |
|:---|:---|
| [pdf-document-load-fallback.md](./pdf-document-load-fallback.md) | `PdfDocument.load` の fallback recovery 経路。`scanStartXRef` / `mergeXRefChain` 失敗時の `scanFallback` 呼び出し、`XREF_REBUILD` warning 契約、`resolveXRefStructure` / `emitWarnings` ローカル関数の役割、ISO 32000-1 §7.5 との対応 |
| [inline-image-tokenizer.md](./inline-image-tokenizer.md) | ContentStream の inline image (`BI ... ID <bytes> EI`) を 1 個の `TokenType.InlineImage` として扱う実装。dict key/value 保持、raw byte scan、`Tokenizer.seek`、EI boundary 判定、既知制約 |
| [operator-registry.md](./operator-registry.md) | ContentStream operator 名から handler を引く `OperatorRegistry`、`Option<PdfError>` ベースの handler 契約、重複登録エラー、最小 `GraphicsStateStack` 復旧、現時点の制約 |

## 配置ルール

- **spec (理想形・公開 API 設計)**: [`docs/pdf-parsing-pipeline/`](../pdf-parsing-pipeline/) 配下
- **実装 (内部の振る舞い・degraded recovery などの実装事情)**: 本フォルダ配下
- 1 機能で spec / 実装の両方がある場合は両側にファイルを置き、相互リンクで紐付ける
