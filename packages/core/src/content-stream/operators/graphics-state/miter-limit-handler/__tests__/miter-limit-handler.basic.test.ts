import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { miterLimitHandler } from "../../miter-limit-handler";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

test("integer operand 5 で current miterLimit が 5 に更新される", () => {
  const ctx = buildContext([{ type: "integer", value: 5 }]);

  const result = miterLimitHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.miterLimit).toBe(5);
});

test("real operand 2.5 で current miterLimit が 2.5 に更新される", () => {
  const ctx = buildContext([{ type: "real", value: 2.5 }]);

  const result = miterLimitHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.miterLimit).toBe(2.5);
});

test("real operand 10.0 (PDF default) で current miterLimit が 10.0 に更新される", () => {
  const ctx = buildContext([{ type: "real", value: 10.0 }]);

  const result = miterLimitHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.miterLimit).toBe(10.0);
});

test.each([
  {
    label: "0",
    operand: { type: "integer", value: 0 } as PdfObject,
    expected: 0,
  },
  {
    label: "negative",
    operand: { type: "real", value: -1.5 } as PdfObject,
    expected: -1.5,
  },
  {
    label: "NaN",
    operand: { type: "real", value: Number.NaN } as PdfObject,
    expected: Number.NaN,
  },
  {
    label: "Infinity",
    operand: { type: "real", value: Number.POSITIVE_INFINITY } as PdfObject,
    expected: Number.POSITIVE_INFINITY,
  },
])("境界値 $label の operand も handler では検証せずそのまま GraphicsState に格納する", ({
  operand,
  expected,
}) => {
  const ctx = buildContext([operand]);

  const result = miterLimitHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.miterLimit).toBe(expected);
});

test("空 operand stack では OPERATOR_OPERAND_MISSING を返す", () => {
  const ctx = buildContext([]);

  const result = miterLimitHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("M");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'M' requires 1 operand(s), got 0",
  );
});

test.each([
  {
    type: "name" as const,
    operand: { type: "name", value: "Foo" } as PdfObject,
  },
  {
    type: "boolean" as const,
    operand: { type: "boolean", value: true } as PdfObject,
  },
])("末尾が $type のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す", ({
  type,
  operand,
}) => {
  const ctx = buildContext([operand]);

  const result = miterLimitHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("M");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(type);
  expect(result.error.message).toBe(
    `Operator 'M' expected number operand, got ${type}`,
  );
});

test("operand stack に複数要素がある場合、成功時は末尾 1 つだけ pop し残りはそのまま", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "integer", value: 7 };
  const ctx = buildContext([head, tail]);

  const result = miterLimitHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("末尾が name のとき (TYPE_MISMATCH)、末尾 1 つだけ pop し残り operand は保持される", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "name", value: "Foo" };
  const ctx = buildContext([head, tail]);

  const result = miterLimitHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
  const top = OperandStack.peek(ctx.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("miterLimit 更新後も lineWidth/lineCap/lineJoin/ctm は不変", () => {
  const ctx = buildContext([{ type: "integer", value: 3 }]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = miterLimitHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.lineJoin).toBe(before.lineJoin);
  expect(after.ctm).toEqual(before.ctm);
});
