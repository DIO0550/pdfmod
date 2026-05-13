import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack, LineJoin } from "../../../../graphics-state/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { lineJoinHandler } from "../../line-join-handler";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

test.each([
  { value: 0 },
  { value: 1 },
  { value: 2 },
] as const)("integer operand $value で current lineJoin が LineJoin.create($value) に更新される", ({
  value,
}) => {
  const ctx = buildContext([{ type: "integer", value }]);

  const result = lineJoinHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.lineJoin).toBe(LineJoin.create(value));
});

test.each([
  { label: "3", value: 3 },
  { label: "negative", value: -1 },
  { label: "MAX_SAFE_INTEGER", value: Number.MAX_SAFE_INTEGER },
])("値域外 integer $label で OPERATOR_OPERAND_VALUE_OUT_OF_RANGE を返す", ({
  value,
}) => {
  const ctx = buildContext([{ type: "integer", value }]);

  const result = lineJoinHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_VALUE_OUT_OF_RANGE");
  expect(result.error.operatorName).toBe("j");
  expect(result.error.allowed).toBe(LineJoin.allowed);
  expect(result.error.allowed).toEqual([0, 1, 2]);
  expect(result.error.actual).toBe(value);
  expect(result.error.message).toBe(
    `Operator 'j' operand value ${value} is out of range, expected one of [0, 1, 2]`,
  );
});

test.each([
  {
    type: "real" as const,
    operand: { type: "real", value: 1.5 } as PdfObject,
  },
  {
    type: "name" as const,
    operand: { type: "name", value: "Foo" } as PdfObject,
  },
  {
    type: "boolean" as const,
    operand: { type: "boolean", value: true } as PdfObject,
  },
  {
    type: "array" as const,
    operand: { type: "array", elements: [] } as PdfObject,
  },
  {
    type: "dictionary" as const,
    operand: { type: "dictionary", entries: new Map() } as PdfObject,
  },
])("末尾が $type のとき OPERATOR_OPERAND_TYPE_MISMATCH を返す (expected='integer')", ({
  type,
  operand,
}) => {
  const ctx = buildContext([operand]);

  const result = lineJoinHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("j");
  expect(result.error.expected).toBe("integer");
  expect(result.error.actual).toBe(type);
  expect(result.error.message).toBe(
    `Operator 'j' expected integer operand, got ${type}`,
  );
});

test("空 operand stack で OPERATOR_OPERAND_MISSING を返す", () => {
  const ctx = buildContext([]);

  const result = lineJoinHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("j");
  expect(result.error.required).toBe(1);
  expect(result.error.actual).toBe(0);
  expect(result.error.message).toBe(
    "Operator 'j' requires 1 operand(s), got 0",
  );
});

test("operand stack に複数要素がある場合、末尾 1 つだけ pop し残りはそのまま", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "integer", value: 1 };
  const ctx = buildContext([head, tail]);

  const result = lineJoinHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("値域外 integer 3 のとき末尾 1 つだけ pop し、残り operand は保持される", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "integer", value: 3 };
  const ctx = buildContext([head, tail]);

  const result = lineJoinHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
  const top = OperandStack.peek(ctx.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("末尾が name のとき (TYPE_MISMATCH)、末尾 1 つだけ pop し残り operand は保持される", () => {
  const head: PdfObject = { type: "integer", value: 99 };
  const tail: PdfObject = { type: "name", value: "Foo" };
  const ctx = buildContext([head, tail]);

  const result = lineJoinHandler(ctx);

  assert(!result.ok);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
  const top = OperandStack.peek(ctx.operandStack);
  assert(top.some);
  expect(top.value).toEqual(head);
});

test("lineJoin 更新後も lineWidth/lineCap/miterLimit/ctm は不変", () => {
  const ctx = buildContext([{ type: "integer", value: 1 }]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = lineJoinHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.miterLimit).toBe(before.miterLimit);
  expect(after.ctm).toEqual(before.ctm);
});
