# Content stream operator と graphics state stack 実装メモ

このドキュメントは、今回の実装が PDF 仕様のどの部分を受け持つかを説明します。
コード上の主役は `OperatorRegistry` と `GraphicsStateStack` ですが、仕様上は **content stream の operator dispatch** と **graphics state の保存・復元** に対応します。

## PDF仕様上の位置づけ

PDF ページの見た目は、ページ辞書の `/Contents` に入っている content stream で表現されます。
content stream は命令列で、数値・名前・文字列などの operand が先に並び、最後に operator が来る後置記法です。

```pdf
100 200 m
150 250 l
S
```

この例では `100 200` が `m` operator の operand、`150 250` が `l` operator の operand、`S` は構築済み path を stroke する operator です。
PDF には一般的なプログラミング言語のようなループ、条件分岐、変数宣言はなく、interpreter は token を順に読みながら operand stack と graphics state を更新します。

今回の `OperatorRegistry` は、この処理モデルのうち「operator 名を見つけたとき、どの handler を実行するか」を解決する部品です。
まだ operator の実処理や `ContentStreamInterpreter` 全体は実装していません。

関連する既存仕様:

- [05. コンテンツストリームと描画オペレータ](../specs/05_content_streams.md)
- [04. リソース辞書とグラフィックスステート](../specs/04_resources_graphics_state.md)

## 今回扱うPDF概念

### Content stream operator

PDF operator は短い名前で描画処理を表します。
例として、path construction の `m` / `l`、text object の `BT` / `ET`、色指定の `rg`、graphics state の `q` / `Q` などがあります。

今回の実装では、これらの operator を直接描画処理として実装したわけではありません。
代わりに、operator 名と handler の対応を登録・検索する registry を追加しました。
これは後続の interpreter が、tokenizer から operator token を受け取ったときに dispatch するための下地です。

```mermaid
flowchart LR
  Contents[/Page Contents stream/] --> Tokenizer[ContentStreamTokenizer]
  Tokenizer --> OperatorToken[Operator token: m / BT / rg / q / Q]
  OperatorToken --> Registry[OperatorRegistry]
  Registry --> Handler[OperatorHandler]
  Handler --> State[OperandStack / GraphicsStateStack]
```

### Operand stack

PDF content stream は後置記法なので、operator が現れるまで operand を stack に積みます。
`OperatorHandler` が `OperandStack` を受け取るのは、operator が自分に必要な operand を stack から取り出して処理するためです。

今回の PR では `OperandStack` 自体は新規実装対象ではありません。
`OperatorRegistry` の handler signature に組み込むことで、後続 operator 実装が PDF の後置記法モデルに沿って書けるようにしています。

### Graphics state stack

PDF graphics state は、線幅、線端、線接合、変換行列、色、クリッピングパス、テキスト状態など、描画に影響する状態の集合です。
content stream では `q` operator が現在の graphics state を保存し、`Q` operator が直近の保存状態を復元します。

```pdf
q
  1 0 0 1 100 200 cm
  /Im0 Do
Q
```

この例では、`q` で現在の状態を保存し、`cm` で座標変換を加え、`Do` で XObject を描画し、`Q` で変換前の状態に戻します。
今回の `GraphicsStateStack` は、この `q` / `Q` の保存・復元モデルに対応する最小実装です。

現時点の `GraphicsStateStack` は graphics state 全体の完全実装ではなく、既存の `GraphicsState` を LIFO で保存・復元するための器です。
`cm`、`w`、`J`、`j`、`rg` など個別 operator による state 更新は後続フェーズの対象です。

## 実装した境界

`OperatorRegistry` 本体は `@pdfmod/core` の root export には出していません。
現時点では content stream 内部の拡張点として扱い、root export は既存 error type と同様に `PdfOperatorRegistryError` のみ追加しています。

### OperatorRegistry の契約

`OperatorRegistry` は `Map<string, OperatorHandler>` を内部に持つ branded type です。
グローバル singleton ではなく `create()` で registry instance を生成するため、テスト間や interpreter instance 間で登録状態が共有されません。
`handlers` フィールドは規約上 private 扱いで、外部コードは直接参照・変更せず companion object API を使います。
companion object の操作は immutable を前提とし、受け取った registry は変更せず新しい registry を返します。

```ts
export type OperatorHandlerContext = {
  readonly operandStack: OperandStack;
  readonly graphicsStateStack: GraphicsStateStack;
};

export type OperatorHandler = (
  context: OperatorHandlerContext,
) => Result<OperatorHandlerContext, PdfError>;
```

handler は operand stack と graphics state stack をまとめた context を受け取り、成功時は更新後 context を返します。
これにより、operator 実装も受け取った stack を直接変更せず、新しい実行状態を返す設計にできます。

#### register

`register(registry, name, handler)` は registry を変更せず、成功時に handler 追加済みの新しい registry を返します。
成功時に新しい値を生成する操作なので、戻り値は `Result<OperatorRegistry, PdfError>` です。

- 未登録の operator 名なら handler 追加済みの新しい registry を `Ok` で返す
- 同名 operator が登録済みなら `Err(PdfOperatorRegistryError)` を返す
- 元 registry は成功時も失敗時も変更しない
- 重複登録時は既存 handler を上書きしない
- operator 名の妥当性検証は行わず、空文字も通常の `Map` key として扱う

重複登録エラーの構造は次の通りです。

```ts
{
  code: "OPERATOR_ALREADY_REGISTERED",
  message: `Operator is already registered: ${name}`,
  operatorName: name,
}
```

#### lookup / has

`lookup(registry, name)` は登録済みなら `Some(OperatorHandler)`、未登録なら `None` を返します。
`has(registry, name)` は登録済み判定だけを `boolean` で返します。

### GraphicsStateStack の契約

`OperatorHandler` は operand stack と graphics state stack を受け取る設計です。
local `main` に `GraphicsStateStack` の実装シンボルがなかったため、#133 相当の最小 API も同時に復旧しています。

`GraphicsStateStack` は現在状態 `current` と保存済み状態 `saved` を持ちます。
`current` / `saved` フィールドは規約上 private 扱いで、外部コードは直接参照・変更せず companion object API を使います。
companion object の操作は immutable を前提とし、受け取った stack は変更せず新しい stack を返します。

- `create()` はデフォルト `GraphicsState` を current に持つ stack を作る
- `save()` は current を LIFO stack に保存した新しい stack を返す
- `restore()` は直近の saved state を current に戻した新しい stack を返す
- saved state がない `restore()` は current を維持した新しい stack を返す
- `replaceCurrent()` は current を差し替えた新しい stack を返す

`GraphicsState` 型は `graphics-state.ts` に分離し、`graphics-state/index.ts` と `stack.ts` の循環依存を避けています。

### 重複登録エラー

PDF 仕様そのものに「operator registry」は登場しません。
これはライブラリ内部で標準 operator や将来の拡張 operator を登録するための実装上の表現です。

同じ operator 名へ複数 handler を登録すると dispatch 結果が曖昧になるため、重複登録は `PdfOperatorRegistryError` として扱います。
このエラーは PDF ファイルの構文エラーではなく、ライブラリの operator 登録設定エラーです。

## テストで保証している挙動

`packages/core/src/content-stream/operator-registry/index.test.ts` では次を検証しています。

- 作成直後の registry は未登録 operator を持たない
- `register` 後の新しい registry で `lookup` が同じ handler を `Some` で返す
- `register` は元 registry を変更しない
- `register` 後の新しい registry で `has` が `true` を返す
- 異なる operator 名は独立して登録できる
- 同名 operator の重複登録は `OPERATOR_ALREADY_REGISTERED` を返す
- 重複登録後も既存 handler を保持する
- 空文字 operator 名は妥当性検証せず通常 key として登録する

`packages/core/src/content-stream/graphics-state/stack.basic.test.ts` では `save` / `restore` の LIFO 挙動、空 stack restore の no-op、`replaceCurrent`、および元 stack を変更しないことを検証しています。

error type 側では `PdfOperatorRegistryError` が `PdfError` union と root type export から扱えることを検証しています。

## 現時点の制約

- PDF 標準 operator の意味論はまだ実装していない
- `ContentStreamInterpreter` 本体はまだ存在しない
- `OperatorRegistry` は handler の実行順や operand 数の検証を行わない
- operator 名の構文検証は行わない
- 未登録 operator を PDF 処理エラーに変換する処理は未実装
- 既存 `OperandStack` は mutable API のままで、後続 interpreter 実装時に immutable context 方針へ合わせる必要がある
- `GraphicsStateStack` は `q` / `Q` の保存・復元モデルのみを扱い、CTM、色、線幅などの具体的な state 変更 operator はまだ扱わない

これらは後続フェーズで interpreter と個別 operator handler を追加するときに扱います。
