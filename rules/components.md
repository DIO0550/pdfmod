# コンポーネント規約

対象は `packages/react/src/components/`。**`@pdfmod/react` はライブラリなので、props は利用者に対する公開APIそのもの**であり、一度出したものは外しにくい。

## props は最小限から始める

- props はオブジェクトで受け、必要最小限に絞る。**使わない props を「将来のため」に足さない**
- 真偽値 props よりも、状態を表す列挙(`variant="..."`)を優先する
- **見た目の固定を避ける。** 色・余白・フォントをコンポーネント内にハードコードせず、`className` と構造の差し替えで利用者側が決められるようにする

## Composition パターン

props が多くなったコンポーネントは、props を増やし続けるのではなく **Composition(合成)** で組み立てる。

- props が概ね5個を超える、または真偽値 props(`showToolbar`, `hasPageNumber` 等)で内部の出し分けが増えてきたら Composition を検討する
- 「設定を渡して中身を制御する」のではなく「中身を子要素として渡す」形に変える

```tsx
// NG                                   // OK
<PdfViewer source={bytes} showToolbar   <PdfViewer source={bytes}>
  toolbarPosition="top" showPageNumber    <PdfViewer.Toolbar position="top" />
  pageNumberAlign="center"                <PdfViewer.Pages />
/>                                      </PdfViewer>
```

## 関連する部品は名前空間でまとめる

意味的にまとまりのある複合コンポーネントは、`Parent.Child` 形式(コンパウンドコンポーネント)で公開してよい。

- 親が暗黙のコンテキスト(状態・スタイル)を提供し、子がそれを利用する関係のときに使う
- 子を `Parent.Child` として公開する(`<PdfViewerToolbar />` のような独立公開より、所属が型と補完で明確になる)
- 単なる無関係な部品の寄せ集めに名前空間を付けない(濫用禁止)

## Provider / Context の使いどころ

props のバケツリレーが長くなり、中間コンポーネントが自分では使わない値を下位へ渡すだけになっている場合は、Provider / Context を検討する。

- 3階層以上にわたって同じ props を通過させている、または複数の兄弟サブツリーで同じ状態が必要になったら Provider を検討する
- まずは props / Composition / children で十分かを確認する。Provider は依存元が見えにくくなるため、単に1〜2階層渡すだけなら props を優先する
- **ライブラリの Provider は利用者のツリーに置かせるものなので、スコープを必要最小限にする。** 1つの巨大 Context にまとめず、更新頻度や責務が異なる値は Provider を分ける
- `useContext` を包むアクセサフックが **Provider の外で呼ばれた場合の `throw` は使ってよい**。実行時に起こりうる失敗ではなく、コンポーネントの配置ミスであり、呼び出し側が分岐して回復するものではないため。**既定値を返して埋めるのは禁止**(Provider の付け忘れが画面に出ないまま残る)

## hooks と UI の分離(headless 原則)

**カスタムフックは JSX を返さない。** state・派生値・ハンドラ・(必要なら DOM に spread する) props オブジェクトだけを返し、JSX の組み立ては呼び出し側コンポーネントが行う。React Aria / TanStack Table / React Hook Form 等が採る "headless" の方針に従う。

- **公開するカスタムフックは必ず headless で書く。** UI ライブラリ・マークアップを hook 側で固定しない
- 例外: **同一コンポーネント内の private な整理**目的で、外に export しない hook が JSX を返すのは許容
- 共有 UI が必要なら、フックではなく**通常のコンポーネント**(必要なら Provider と組み合わせ)で提供する

## 網羅を型で強制する

読み込み中・エラー・空・成功のような排他な状態で出し分けるコンポーネントは、`if` の連なりではなく**判別可能な union に対する `switch`**(`default` なし)で書き、**戻り値の型を `ReactElement` と書く**。`ReactNode` は `undefined` を含むため、case が抜けても通ってしまう(→ `rules/coding.md`「列挙した状態の網羅を型で強制する」)。

## その他

- 1コンポーネント1責務。表示と状態管理・データ取得を同居させない(ロジックは hooks / `@pdfmod/core` 側)
- **PDF の判定・計算・変換をコンポーネントに書かない。** コンポーネントの責務は core の結果を描くことだけ
- テストから引くための `data-testid` は、**表示の状態ごとに1つ**与える(`pdf-viewer-loading` / `pdf-viewer-error`)。クラス名や文言でテストが要素を引く状態にしない
