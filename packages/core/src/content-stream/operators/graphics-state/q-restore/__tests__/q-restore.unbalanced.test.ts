import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
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

test("saved が空のときに Q を実行しても ok を返す", () => {
  const ctx = buildContext();

  const result = qRestoreHandler(ctx);

  assert(result.ok);
});

test("saved が空のときに Q を実行しても current は変更されない", () => {
  const ctx = buildContext();
  const beforeCurrent = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = qRestoreHandler(ctx);

  assert(result.ok);
  const afterCurrent = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  );
  expect(afterCurrent).toEqual(beforeCurrent);
});

test("q 1 回 → Q 2 回で 2 回目の Q も ok を返す", () => {
  const ctx = buildContext();
  const initialCurrent = GraphicsStateStack.current(ctx.graphicsStateStack);

  const savedStack = GraphicsStateStack.save(ctx.graphicsStateStack);
  const firstQ = qRestoreHandler({ ...ctx, graphicsStateStack: savedStack });
  assert(firstQ.ok);

  const secondQ = qRestoreHandler({
    ...ctx,
    graphicsStateStack: firstQ.value.graphicsStateStack,
  });
  assert(secondQ.ok);

  const finalCurrent = GraphicsStateStack.current(
    secondQ.value.graphicsStateStack,
  );
  expect(finalCurrent).toEqual(initialCurrent);
});

test("Q を連続 3 回実行しても毎回 ok を返し current が不変", () => {
  const ctx = buildContext();
  const initialCurrent = GraphicsStateStack.current(ctx.graphicsStateStack);

  let currentCtx: OperatorHandlerContext = ctx;
  for (let i = 0; i < 3; i++) {
    const result = qRestoreHandler(currentCtx);
    assert(result.ok);
    currentCtx = {
      ...currentCtx,
      graphicsStateStack: result.value.graphicsStateStack,
    };
  }

  const finalCurrent = GraphicsStateStack.current(
    currentCtx.graphicsStateStack,
  );
  expect(finalCurrent).toEqual(initialCurrent);
});

test("連続 Q 実行後も operandStack が消費されない", () => {
  const ctx = buildContext();
  const operand1: PdfObject = { type: "integer", value: 10 };
  const operand2: PdfObject = { type: "integer", value: 20 };
  OperandStack.push(ctx.operandStack, operand1);
  OperandStack.push(ctx.operandStack, operand2);

  const first = qRestoreHandler(ctx);
  assert(first.ok);
  const second = qRestoreHandler({
    ...ctx,
    graphicsStateStack: first.value.graphicsStateStack,
  });
  assert(second.ok);

  expect(OperandStack.depth(second.value.operandStack)).toBe(2);
  const top = OperandStack.peek(second.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(operand2);
});

test("非デフォルト current で saved が空の Q を打っても値が保たれ、その後の q → Q で復帰する", () => {
  const ctx = buildContext();
  const seeded = GraphicsState.update(
    GraphicsStateStack.current(ctx.graphicsStateStack),
    { lineWidth: 3.75 },
  );

  const unbalanced = qRestoreHandler({
    ...ctx,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      ctx.graphicsStateStack,
      seeded,
    ),
  });

  assert(unbalanced.ok);
  expect(
    GraphicsStateStack.current(unbalanced.value.graphicsStateStack),
  ).toEqual(seeded);
  expect(unbalanced.value.graphicsStateStack.saved).toHaveLength(0);

  const savedStack = GraphicsStateStack.save(
    unbalanced.value.graphicsStateStack,
  );
  const modified = GraphicsStateStack.replaceCurrent(
    savedStack,
    GraphicsState.update(seeded, { lineWidth: 99 }),
  );

  const restored = qRestoreHandler({
    ...ctx,
    graphicsStateStack: modified,
  });

  assert(restored.ok);
  const finalCurrent = GraphicsStateStack.current(
    restored.value.graphicsStateStack,
  );
  expect(finalCurrent).toEqual(seeded);
  expect(finalCurrent.lineWidth).toBe(3.75);
  expect(restored.value.graphicsStateStack.saved).toHaveLength(0);
});
