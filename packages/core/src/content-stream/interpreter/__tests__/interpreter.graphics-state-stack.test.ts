// 本ファイルは content stream を interpreter に流したときの graphics state stack の
// 「中間状態」と「unbalanced Q で warnings が積まれないこと」を担当する。
//
// 既存の担当範囲（重複を作らないための境界）:
//   - graphics-state-operators.integration.test.ts:46 が 3 段ネスト
//     `q 2 w q 3 w q 4 w Q Q Q` の interpreter 経由の初期復帰を検証済み
//     （Issue #484 の「ネスト 3 段以上の動作確認」はこのテストで充足されている）。
//     同 :62 が unbalanced Q の ok・current 不変、同 :30 が cm + w の一括巻き戻しを担当。
//   - q-restore.nested.test.ts / q.basic.test.ts が handler 直呼びで
//     中間 current と saved の中身を検証済み。
//   - q.basic.test.ts:48,66 / q-restore.basic.test.ts:59,85 /
//     q-restore.unbalanced.test.ts:83 が operand stack の同一参照・非消費を
//     handler 層で検証済み（本ファイルでは独立ケースを立てず、ケース 1 の
//     アサーションとして interpreter 層でも一度だけ確認する）。
//   - q-restore.unbalanced.test.ts:104 が非デフォルト state での unbalanced Q と
//     その後の復帰を検証済み（本ファイルでは扱わない）。
//
// 本ファイルの差分は次の 3 点:
//   1. ストリームのプレフィックスを段階的に伸ばして毎回 fresh context で一括実行し、
//      各段の中間 current / saved を interpreter（tokenizer + dispatch）経由で観測すること
//   2. unbalanced Q で warnings が空である現行挙動を pin down すること
//      （qRestoreHandler が UNBALANCED_RESTORE を破棄する事実は既存未検証）
//   3. lineWidth / lineCap / ctm の 3 フィールド同時変更が Q で一括して戻ること
//      （既存 integration は 2 フィールドまで）
//
// 観測手法について: 中間状態は「累積プレフィックス方式」で観測する。すなわち
// execute("q 2 w") / execute("q 2 w q 3 w") / ... と毎回 fresh context で
// 伸ばしたストリームを一括実行する。execute の結果 context を次の execute の
// initialContext に渡すチェーン方式は採らない（観測点が fragment 境界に限られ、
// interpreter が単一の連続ストリームを実行する途中の状態を見たことにならないため）。

import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
  LineCap,
  Matrix,
} from "../../graphics-state/index";
import { MarkedContentStack } from "../../marked-content/stack/index";
import { OperandStack } from "../../operand-stack/index";
import type { OperatorHandlerContext } from "../../operator-registry/index";
import { OperatorRegistry } from "../../operator-registry/index";
import { registerGraphicsStateOperators } from "../../operators/graphics-state/graphics-state-operators/index";
import type { ContentStreamInterpreterResult } from "../index";
import { ContentStreamInterpreter } from "../index";

const encode = (s: string): Uint8Array => new TextEncoder().encode(s);

/** production の登録ヘルパ経由で q / Q / w / J / cm を持つ registry を組み立てる。 */
const createRegistry = (): OperatorRegistry => {
  const registered = registerGraphicsStateOperators(OperatorRegistry.create());
  assert(registered.ok);
  return registered.value;
};

/**
 * content stream を実行し `{ context, warnings }` を返すヘルパ（失敗時は assert で即座に検出）。
 * initialContext は operand を積んだ状態から開始したい場合にのみ渡す。
 *
 * @param stream - 実行する content stream 文字列
 * @param initialContext - 任意の初期 context（省略時は interpreter 側で新規生成される）
 * @returns 実行完了時点の context と warnings
 */
const execute = (
  stream: string,
  initialContext?: OperatorHandlerContext,
): ContentStreamInterpreterResult => {
  const result = ContentStreamInterpreter.execute({
    data: encode(stream),
    registry: createRegistry(),
    initialContext,
  });
  assert(result.ok);
  return result.value;
};

/**
 * 初期 context を組み立てる。q/Q 系 handler テストの buildContext と同一形。
 *
 * @returns 空の operand stack / 既定の graphics state stack を持つ context
 */
const buildContext = (): OperatorHandlerContext => ({
  operandStack: OperandStack.create(),
  graphicsStateStack: GraphicsStateStack.create(),
  markedContentStack: MarkedContentStack.create(),
});

const defaultState = GraphicsState.create();
const lineWidth2State = GraphicsState.update(defaultState, { lineWidth: 2 });
const lineWidth3State = GraphicsState.update(lineWidth2State, { lineWidth: 3 });
const lineWidth4State = GraphicsState.update(lineWidth3State, { lineWidth: 4 });
const lineWidth5State = GraphicsState.update(lineWidth4State, { lineWidth: 5 });

// q を積むたびに saved が 1 段ずつ伸び、current が直前の w の値を保つことを
// interpreter 経由で観測する。warnings 空の確認は registerGraphicsStateOperators の
// 登録漏れによる UNKNOWN_OPERATOR 回帰を直接検知するために同居させている。
// 末尾の operand 注入は UC-4（q / Q が operand stack を破壊しない）の interpreter 層確認。
test("q と w のプレフィックスを伸ばして実行すると各段の current と saved が 1 段ずつ積み上がる", () => {
  const step1 = execute("q 2 w");
  expect(GraphicsStateStack.current(step1.context.graphicsStateStack)).toEqual(
    lineWidth2State,
  );
  expect(step1.context.graphicsStateStack.saved).toEqual([defaultState]);
  expect(step1.warnings).toEqual([]);

  const step2 = execute("q 2 w q 3 w");
  expect(GraphicsStateStack.current(step2.context.graphicsStateStack)).toEqual(
    lineWidth3State,
  );
  expect(step2.context.graphicsStateStack.saved).toEqual([
    defaultState,
    lineWidth2State,
  ]);

  const step3 = execute("q 2 w q 3 w q 4 w");
  expect(GraphicsStateStack.current(step3.context.graphicsStateStack)).toEqual(
    lineWidth4State,
  );
  expect(step3.context.graphicsStateStack.saved).toEqual([
    defaultState,
    lineWidth2State,
    lineWidth3State,
  ]);

  // UC-4: operand を積んだ context で q / Q 双方の経路を通しても operand stack は
  // 同一参照のまま depth も中身も変化しない
  const seeded = buildContext();
  const operand1: PdfObject = { type: "integer", value: 10 };
  const operand2: PdfObject = { type: "integer", value: 20 };
  OperandStack.push(seeded.operandStack, operand1);
  OperandStack.push(seeded.operandStack, operand2);

  const withOperands = execute("q 2 w q 3 w q 4 w Q Q Q", seeded);
  expect(withOperands.context.operandStack).toBe(seeded.operandStack);
  expect(OperandStack.depth(withOperands.context.operandStack)).toBe(2);
  const top = OperandStack.peek(withOperands.context.operandStack);
  assert(top.some);
  expect(top.value).toEqual(operand2);
});

// Q を 1 つずつ足したストリームを一括実行し、current と saved が 1 段ずつ
// 巻き戻る（一気に深度 0 へ落ちない）ことを interpreter 経由で観測する。
// 深度 3 の初期状態は q ... w を含むストリーム側で作り、テスト内で
// GraphicsStateStack の save API を直接呼んで組み立てることはしない。
test("Q のプレフィックスを伸ばして実行すると各段の current と saved が 1 段ずつ巻き戻る", () => {
  const step1 = execute("q 2 w q 3 w q 4 w Q");
  expect(GraphicsStateStack.current(step1.context.graphicsStateStack)).toEqual(
    lineWidth3State,
  );
  expect(step1.context.graphicsStateStack.saved).toEqual([
    defaultState,
    lineWidth2State,
  ]);

  const step2 = execute("q 2 w q 3 w q 4 w Q Q");
  expect(GraphicsStateStack.current(step2.context.graphicsStateStack)).toEqual(
    lineWidth2State,
  );
  expect(step2.context.graphicsStateStack.saved).toEqual([defaultState]);

  const step3 = execute("q 2 w q 3 w q 4 w Q Q Q");
  expect(GraphicsStateStack.current(step3.context.graphicsStateStack)).toEqual(
    defaultState,
  );
  expect(step3.context.graphicsStateStack.saved).toEqual([]);
});

// 深度 4 への三角測量。既存テストの最大深度は 3 のため、深度 3 固定の実装に
// 依存していないことを確認する。前半 3 段はケース 1 が担当済みなので、
// 深度 4 到達時点の current と saved のみを見る。
test("深度 4 まで q を積んでも同じ規則で current と saved が積み上がる", () => {
  const result = execute("q 2 w q 3 w q 4 w q 5 w");

  expect(GraphicsStateStack.current(result.context.graphicsStateStack)).toEqual(
    lineWidth5State,
  );
  expect(result.context.graphicsStateStack.saved).toEqual([
    defaultState,
    lineWidth2State,
    lineWidth3State,
    lineWidth4State,
  ]);
});

// qRestoreHandler が GraphicsStateStack の restore API が返す UNBALANCED_RESTORE
// warning を破棄するため、saved が空の Q を通しても warnings には何も積まれない。
// これは現行挙動の pin down であり、将来 warning を interpreter へ伝播させる
// 設計変更を行えば意図的に red になる。
test("saved が空の状態で Q を実行しても warnings は空のまま", () => {
  const result = execute("Q");

  expect(result.warnings).toEqual([]);
});

// lineWidth / lineCap / ctm の 3 フィールドを同時に変更してから Q を打つと、
// 3 つとも一括で保存時点の state へ戻る（既存 integration は cm + w の 2 フィールドまで）。
// Q 前の期待値はリテラルで固定し、production の計算結果を流用しない。
test("lineWidth・lineCap・ctm の 3 フィールドを変更しても Q で一括して初期状態へ戻る", () => {
  const beforeRestore = execute("q 5 w 2 J 2 0 0 2 10 20 cm");
  const current = GraphicsStateStack.current(
    beforeRestore.context.graphicsStateStack,
  );
  expect(current.lineWidth).toBe(5);
  expect(current.lineCap).toEqual(LineCap.create(2));
  expect(current.ctm).toEqual(Matrix.create(2, 0, 0, 2, 10, 20));

  const afterRestore = execute("q 5 w 2 J 2 0 0 2 10 20 cm Q");
  expect(
    GraphicsStateStack.current(afterRestore.context.graphicsStateStack),
  ).toEqual(GraphicsState.create());
});
