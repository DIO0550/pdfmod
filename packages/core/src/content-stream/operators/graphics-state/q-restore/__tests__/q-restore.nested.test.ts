// 本ファイルは深度 3 の saved を積んだ stack に Q を 3 回通し、
// 中間 current と残存 saved の内容を検証する。
// q-restore.basic.test.ts は深度 1 の save / restore を、
// q-restore.unbalanced.test.ts は saved 空起点の no-op を担当済み。
// graphics-state-operators.integration.test.ts は 3 段ネストを registry 経由で
// 通すが最終 current のみを検証し、graphics-state/stack の stack.basic.test.ts は
// 中間状態を見るが深度 2 まで。本ファイルの差分は handler 層で中間状態を見る
// 唯一のテストであること、および深度 3 への三角測量の 2 点。
import { assert, expect, test } from "vitest";
import {
  GraphicsState,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { qRestoreHandler } from "../../q-restore";

const buildContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  const graphicsStateStack = GraphicsStateStack.create();
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

const buildNestedStack = (
  base: GraphicsStateStack,
  states: readonly GraphicsState[],
): GraphicsStateStack => {
  let stack = base;
  for (const state of states) {
    stack = GraphicsStateStack.save(
      GraphicsStateStack.replaceCurrent(stack, state),
    );
  }
  return stack;
};

test("深度 3 の saved に Q を 3 回通すと current が保存の逆順に復帰する", () => {
  const ctx = buildContext();
  const state1 = GraphicsStateStack.current(ctx.graphicsStateStack);
  const state2 = GraphicsState.update(state1, { lineWidth: 2 });
  const state3 = GraphicsState.update(state1, { lineWidth: 4 });
  const state4 = GraphicsState.update(state1, { lineWidth: 8 });
  const nested = GraphicsStateStack.replaceCurrent(
    buildNestedStack(ctx.graphicsStateStack, [state1, state2, state3]),
    state4,
  );

  const first = qRestoreHandler({ ...ctx, graphicsStateStack: nested });
  assert(first.ok);
  expect(GraphicsStateStack.current(first.value.graphicsStateStack)).toEqual(
    state3,
  );

  const second = qRestoreHandler({
    ...ctx,
    graphicsStateStack: first.value.graphicsStateStack,
  });
  assert(second.ok);
  expect(GraphicsStateStack.current(second.value.graphicsStateStack)).toEqual(
    state2,
  );

  const third = qRestoreHandler({
    ...ctx,
    graphicsStateStack: second.value.graphicsStateStack,
  });
  assert(third.ok);
  expect(GraphicsStateStack.current(third.value.graphicsStateStack)).toEqual(
    state1,
  );
});

test("深度 3 の saved に Q を 3 回通すと残存 saved が先頭側から保たれたまま 1 段ずつ減る", () => {
  const ctx = buildContext();
  const state1 = GraphicsStateStack.current(ctx.graphicsStateStack);
  const state2 = GraphicsState.update(state1, { lineWidth: 2 });
  const state3 = GraphicsState.update(state1, { lineWidth: 4 });
  const nested = buildNestedStack(ctx.graphicsStateStack, [
    state1,
    state2,
    state3,
  ]);
  expect(nested.saved).toHaveLength(3);

  const first = qRestoreHandler({ ...ctx, graphicsStateStack: nested });
  assert(first.ok);
  expect(first.value.graphicsStateStack.saved).toEqual([state1, state2]);

  const second = qRestoreHandler({
    ...ctx,
    graphicsStateStack: first.value.graphicsStateStack,
  });
  assert(second.ok);
  expect(second.value.graphicsStateStack.saved).toEqual([state1]);

  const third = qRestoreHandler({
    ...ctx,
    graphicsStateStack: second.value.graphicsStateStack,
  });
  assert(third.ok);
  expect(third.value.graphicsStateStack.saved).toEqual([]);

  expect(nested.saved).toHaveLength(3);
});
