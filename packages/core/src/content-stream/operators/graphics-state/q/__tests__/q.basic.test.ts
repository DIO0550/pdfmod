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
