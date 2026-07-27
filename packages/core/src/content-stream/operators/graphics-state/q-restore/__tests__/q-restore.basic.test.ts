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

test("Q 実行後に直前の saved state が current に復帰する", () => {
  const ctx = buildContext();
  const initialCurrent = GraphicsStateStack.current(ctx.graphicsStateStack);

  const savedStack = GraphicsStateStack.save(ctx.graphicsStateStack);
  const modified = GraphicsStateStack.replaceCurrent(
    savedStack,
    GraphicsState.update(GraphicsStateStack.current(savedStack), {
      lineWidth: 42,
    }),
  );

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: modified,
  });

  assert(result.ok);
  const restoredCurrent = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  );
  expect(restoredCurrent).toEqual(initialCurrent);
});

test("Q 実行後に saved から 1 つ pop される", () => {
  const ctx = buildContext();
  const savedStack = GraphicsStateStack.save(ctx.graphicsStateStack);

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: savedStack,
  });

  assert(result.ok);
  expect(result.value.graphicsStateStack.saved).toHaveLength(0);
});

test("Q 実行後も operandStack は同一参照のまま", () => {
  const ctx = buildContext();
  const savedStack = GraphicsStateStack.save(ctx.graphicsStateStack);

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: savedStack,
  });

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("Q 実行後も markedContentStack は同一参照のまま", () => {
  const ctx = buildContext();
  const savedStack = GraphicsStateStack.save(ctx.graphicsStateStack);

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: savedStack,
  });

  assert(result.ok);
  expect(result.value.markedContentStack).toBe(ctx.markedContentStack);
});

test("非空 operandStack で Q を実行しても operand が消費されない", () => {
  const ctx = buildContext();
  const operand1: PdfObject = { type: "integer", value: 10 };
  const operand2: PdfObject = { type: "integer", value: 20 };
  OperandStack.push(ctx.operandStack, operand1);
  OperandStack.push(ctx.operandStack, operand2);
  const savedStack = GraphicsStateStack.save(ctx.graphicsStateStack);

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: savedStack,
  });

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(operand2);
});

test("Q 実行後も入力 context の graphicsStateStack は変更されない", () => {
  const ctx = buildContext();
  const seededState = GraphicsState.update(
    GraphicsStateStack.current(ctx.graphicsStateStack),
    { lineWidth: 7.5 },
  );
  const inputStack = GraphicsStateStack.save(
    GraphicsStateStack.replaceCurrent(ctx.graphicsStateStack, seededState),
  );

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: inputStack,
  });

  assert(result.ok);
  expect(inputStack.saved).toHaveLength(1);
  expect(inputStack.saved[0]).toEqual(seededState);
  expect(GraphicsStateStack.current(inputStack)).toEqual(seededState);
  expect(result.value.graphicsStateStack).not.toBe(inputStack);
});

test("非デフォルト state を保存した後の Q は既定値ではなく保存値へ復帰する", () => {
  const ctx = buildContext();
  const defaultState = GraphicsStateStack.current(ctx.graphicsStateStack);
  const savedState = GraphicsState.update(defaultState, {
    lineWidth: 4.5,
    miterLimit: 2.5,
  });
  const savedStack = GraphicsStateStack.save(
    GraphicsStateStack.replaceCurrent(ctx.graphicsStateStack, savedState),
  );
  const modified = GraphicsStateStack.replaceCurrent(
    savedStack,
    GraphicsState.update(savedState, { lineWidth: 1, miterLimit: 10 }),
  );

  const result = qRestoreHandler({
    ...ctx,
    graphicsStateStack: modified,
  });

  assert(result.ok);
  const restoredCurrent = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  );
  expect(restoredCurrent).toEqual(savedState);
  expect(restoredCurrent).not.toEqual(defaultState);
  expect(restoredCurrent.lineWidth).toBe(4.5);
  expect(restoredCurrent.miterLimit).toBe(2.5);
});
