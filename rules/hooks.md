# Hooks 規約

対象は `packages/react/src/hooks/`。**`@pdfmod/react` はライブラリなので、フックは利用者の公開APIそのもの**であり、戻り値の形と依存の少なさがそのまま使い勝手になる。

## useEffect: 最終手段として扱う

useEffect は「外部システムとの同期」専用。React 公式 "You Might Not Need an Effect" に従い、外部システムが関与しない useEffect は禁止する。

- **導出可能な値の state 化禁止**: レンダー中に計算できるものは計算する。重い計算のキャッシュは `useMemo`
- **イベント起因の処理を Effect に書かない**: 利用者の操作への応答はイベントハンドラに書く
- **state リセット目的の Effect 禁止**: コンポーネントツリーのリセットは `key` の変更で行う
- **Effect チェーン禁止**: ある Effect が state を更新し、それが別の Effect を発火させる連鎖は設計の誤り

許可されるのは、ブラウザ API・外部との同期(PDF バイト列の取得など)と、購読の開始/解除(クリーンアップ関数を必ず返す)だけ。

**非同期の取得は「防ぐ」のではなく「結果を捨てる」で書く。** Effect 内で `let cancelled = false` を立て、クリーンアップで `true` にして、解決後に `cancelled` なら state を更新しない(必要なら `AbortController`)。

## useState / useReducer の使い分け

**判断基準: 1つの処理が複数の state を更新するなら `useReducer` を使う。**

| 状況 | 使うもの |
|---|---|
| 単一の独立した値(表示ページ番号、ズーム倍率、選択中の項目) | `useState` |
| 1つの処理が複数の state を同時に更新する / 前の state から次の state を計算する / 更新パターンが複数ある | `useReducer` |

- 1つのイベントハンドラ内で複数の setter を順に呼ぶ実装は禁止。それは state が連動しているサインなので、`useReducer` で1つの state + アクションに統合する
- **読み込み中・エラー・成功のように排他な状態は、1つのオブジェクトにまとめて同時に更新する**(`loading` と `error` と `data` が別々の setter で動くと、矛盾した組み合わせが画面に出る)
- reducer は**純粋関数**としてフックの外(またはファイル外)に定義する。reducer 内での I/O・副作用は禁止

## hooks は PDF のロジックを持たない

hooks(state の更新ロジック、reducer、カスタムフック、イベントハンドラを含む)の責務は**状態の保持と UI イベントの仲介のみ**。PDF の解析・判定・計算・変換は必ず `@pdfmod/core` 側に置き、hooks はそれを呼び出すだけにする。

判定基準: **その処理は React がなくても意味を持つか?** 持つなら core のロジックなので hooks に書いてはならない。

## document / window へのイベントリスナー

**要素の props で済むイベントを document / window に張ることは禁止。** イベントは原則、対象要素の props(`onClick`, `onKeyDown`, `onWheel` 等)で処理する。

- `document` / `window` への addEventListener が許されるのは、**本質的にグローバルな関心事のみ**(`resize`、要素外クリックの検知など)
- その場合も必ず useEffect 内で登録し、クリーンアップ関数で解除すること(解除漏れは違反)
- **ライブラリとしてグローバルリスナーを既定で張らない。** 利用者のアプリ全体に影響するので、必要ならオプトインの形にする

## useRef の使い分け

**判定軸: render で読むなら `useState`、event handler / 同期処理の内側だけで使うなら `useRef`。**

**ref をフラグにした「防御」は禁止。**

- **二重発火防止の `hasFetchedRef` 禁止**: StrictMode の二重実行を ref で抑えにいかない。「防ぐ」のではなく「結果を捨てる」が公式設計
- **ローディング状態を `isLoadingRef` で持たない**: スピナー・`disabled`・エラー UI に出すなら `useState` 一択
- **連打防止の `inFlightRef` 禁止**: ボタンなら `useState` + `disabled` 属性が第一選択

`useRef` が正当なのは、render では読まず event handler 内でだけ参照する mutable な値(`AbortController` 等)と、DOM 要素への参照。

## カスタムフック

- 命名は `useXxx`。1フック1責務。**返すもので名付ける**(何で実装したかではない)
- 同じ hook ロジックが2箇所に現れたらカスタムフックに抽出する
- **過度な抽象化は禁止**: 1箇所でしか使わない単純な state / handler を「何となく整理するため」だけに公開カスタムフックへ切り出さない
- カスタムフックは stateful なロジックの再利用単位であり、状態そのものの共有手段ではない。複数コンポーネントで同じ状態を共有したい場合は state を lift up し、props または Provider で渡す
- **UIを認識しない**: JSX、コンポーネント、className、文言、アイコン、レイアウト都合を返さない(`rules/components.md`「headless 原則」)
- 戻り値は使う側が必要とする最小限に絞る。**公開フックの戻り値を増やすと外せなくなる**

## 共通

- 依存配列を欺く実装(意図的な依存の省略、lint ルールの抑制コメント)は禁止
- フックの条件付き呼び出し禁止(Rules of Hooks 準拠)
