import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  GraphicsState,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { qHandler } from "../../q";

const buildContext = (): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  const graphicsStateStack = GraphicsStateStack.create();
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

test("q 実行後に saved に current がプッシュされる", () => {
  const ctx = buildContext();
  const beforeCurrent = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = qHandler(ctx);

  assert(result.ok);
  const afterStack = result.value.graphicsStateStack;
  const saved = afterStack.saved;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toEqual(beforeCurrent);
});

test("q 実行後の current は実行前と同じ state", () => {
  const ctx = buildContext();
  const beforeCurrent = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = qHandler(ctx);

  assert(result.ok);
  const afterCurrent = GraphicsStateStack.current(
    result.value.graphicsStateStack,
  );
  expect(afterCurrent).toEqual(beforeCurrent);
});

test("q 実行後も operandStack は同一参照のまま", () => {
  const ctx = buildContext();

  const result = qHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("q 実行後も markedContentStack は同一参照のまま", () => {
  const ctx = buildContext();

  const result = qHandler(ctx);

  assert(result.ok);
  expect(result.value.markedContentStack).toBe(ctx.markedContentStack);
});

test("非空 operandStack で q を実行しても operand が消費されない", () => {
  const ctx = buildContext();
  const operand1: PdfObject = { type: "integer", value: 10 };
  const operand2: PdfObject = { type: "integer", value: 20 };
  OperandStack.push(ctx.operandStack, operand1);
  OperandStack.push(ctx.operandStack, operand2);

  const result = qHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(2);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(operand2);
});

test("current を変更しながら q を3回実行すると saved に適用時点の state が順序通り積み上がる", () => {
  const ctx = buildContext();
  const state1 = GraphicsStateStack.current(ctx.graphicsStateStack);

  const first = qHandler(ctx);

  assert(first.ok);
  const state2 = GraphicsState.update(
    GraphicsStateStack.current(first.value.graphicsStateStack),
    { lineWidth: 2 },
  );
  const second = qHandler({
    operandStack: first.value.operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      first.value.graphicsStateStack,
      state2,
    ),
    markedContentStack: first.value.markedContentStack,
  });

  assert(second.ok);
  const state3 = GraphicsState.update(
    GraphicsStateStack.current(second.value.graphicsStateStack),
    { lineWidth: 3 },
  );
  const third = qHandler({
    operandStack: second.value.operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      second.value.graphicsStateStack,
      state3,
    ),
    markedContentStack: second.value.markedContentStack,
  });

  assert(third.ok);
  const saved = third.value.graphicsStateStack.saved;
  expect(saved).toHaveLength(3);
  expect(saved[0]).toEqual(state1);
  expect(saved[1]).toEqual(state2);
  expect(saved[2]).toEqual(state3);
  expect(GraphicsStateStack.current(third.value.graphicsStateStack)).toEqual(
    state3,
  );
});

test("非デフォルト state を持つ context で q を実行すると変更後の値が saved に入る", () => {
  const ctx = buildContext();
  const defaultState = GraphicsStateStack.current(ctx.graphicsStateStack);
  const modifiedState = GraphicsState.update(defaultState, {
    lineWidth: 4.5,
    miterLimit: 2.5,
  });

  const result = qHandler({
    operandStack: ctx.operandStack,
    graphicsStateStack: GraphicsStateStack.replaceCurrent(
      ctx.graphicsStateStack,
      modifiedState,
    ),
    markedContentStack: ctx.markedContentStack,
  });

  assert(result.ok);
  const saved = result.value.graphicsStateStack.saved;
  expect(saved).toHaveLength(1);
  expect(saved[0]).toEqual(modifiedState);
  expect(saved[0]).not.toEqual(defaultState);
});

test("q 実行後も入力 context の graphicsStateStack は変更されない", () => {
  const ctx = buildContext();
  const inputStack = ctx.graphicsStateStack;

  const result = qHandler(ctx);

  assert(result.ok);
  expect(inputStack.saved).toHaveLength(0);
  expect(result.value.graphicsStateStack).not.toBe(inputStack);
});
