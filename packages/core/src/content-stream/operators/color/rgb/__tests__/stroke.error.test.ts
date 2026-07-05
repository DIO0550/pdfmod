import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { RGHandler } from "../stroke";

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

const real = (value: number): PdfObject => ({ type: "real", value });

test.each([
  { operands: [] as PdfObject[], actual: 0 },
  { operands: [real(0.1)], actual: 1 },
  { operands: [real(0.1), real(0.2)], actual: 2 },
])("operand $actual 個のとき OPERATOR_OPERAND_MISSING を返し actual = $actual", ({
  operands,
  actual,
}) => {
  const ctx = buildContext(operands);

  const result = RGHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("RG");
  expect(result.error.required).toBe(3);
  expect(result.error.actual).toBe(actual);
  expect(result.error.message).toBe(
    `Operator 'RG' requires 3 operand(s), got ${actual}`,
  );
});

const nonNumericOperands: Array<{ label: string; operand: PdfObject }> = [
  { label: "name", operand: { type: "name", value: "Foo" } },
  { label: "boolean", operand: { type: "boolean", value: true } },
  {
    label: "string",
    operand: {
      type: "string",
      value: new Uint8Array([0x61]),
      encoding: "literal",
    },
  },
  { label: "null", operand: { type: "null" } },
  { label: "array", operand: { type: "array", elements: [] } },
  { label: "dictionary", operand: { type: "dictionary", entries: new Map() } },
  {
    label: "indirect-ref",
    operand: { type: "indirect-ref", objectNumber: 1, generationNumber: 0 },
  },
  {
    label: "stream",
    operand: {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    },
  },
];

test.each(
  nonNumericOperands,
)("b 位置に $label が来たら OPERATOR_OPERAND_TYPE_MISMATCH を返す", ({
  label,
  operand,
}) => {
  const ctx = buildContext([real(0.1), real(0.2), operand]);

  const result = RGHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("RG");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'RG' expected number operand, got ${label}`,
  );
});

test("g 位置 (push 順 2 番目) に name 型が来たら TYPE_MISMATCH を返し actual='name'", () => {
  const ctx = buildContext([
    real(0.1),
    { type: "name", value: "Foo" },
    real(0.3),
  ]);

  const result = RGHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("name");
});

test("r 位置 (push 順 1 番目) に name 型が来たら TYPE_MISMATCH を返し actual='name'", () => {
  const ctx = buildContext([
    { type: "name", value: "Foo" },
    real(0.2),
    real(0.3),
  ]);

  const result = RGHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("name");
});

test("TYPE_MISMATCH 時に pop 済みの operand は復元しない (depth が減ったまま)", () => {
  const ctx = buildContext([
    real(0.1),
    real(0.2),
    { type: "name", value: "Foo" },
  ]);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = RGHandler(ctx);

  assert(!result.ok);
  expect(beforeDepth).toBe(3);
  expect(OperandStack.depth(ctx.operandStack)).toBe(2);
});
