import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import { GraphicsStateStack } from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { KHandler } from "../stroke";

// 入力配列は push 順 = content stream 出現順 (c, m, y, k)。
// pop は LIFO なので handler 内では k, y, m, c の順で取り出される。
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
  { operands: [real(0.1), real(0.2), real(0.3)], actual: 3 },
])("operand $actual 個のとき OPERATOR_OPERAND_MISSING を返し actual = $actual", ({
  operands,
  actual,
}) => {
  const ctx = buildContext(operands);

  const result = KHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("K");
  expect(result.error.required).toBe(4);
  expect(result.error.actual).toBe(actual);
  expect(result.error.message).toBe(
    `Operator 'K' requires 4 operand(s), got ${actual}`,
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
)("k 位置 (top) に $label が来たら OPERATOR_OPERAND_TYPE_MISMATCH を返す", ({
  label,
  operand,
}) => {
  const ctx = buildContext([real(0.1), real(0.2), real(0.3), operand]);

  const result = KHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("K");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'K' expected number operand, got ${label}`,
  );
});

test.each([
  {
    position: "y",
    label: "name",
    operands: [
      real(0.1),
      real(0.2),
      { type: "name", value: "Foo" } as PdfObject,
      real(0.4),
    ],
  },
  {
    position: "m",
    label: "boolean",
    operands: [
      real(0.1),
      { type: "boolean", value: true } as PdfObject,
      real(0.3),
      real(0.4),
    ],
  },
  {
    position: "c",
    label: "string",
    operands: [
      {
        type: "string",
        value: new Uint8Array([0x61]),
        encoding: "literal",
      } as PdfObject,
      real(0.2),
      real(0.3),
      real(0.4),
    ],
  },
])("$position 位置に $label が来たら TYPE_MISMATCH を返し actual=$label", ({
  label,
  operands,
}) => {
  const ctx = buildContext(operands);

  const result = KHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("K");
  expect(result.error.actual).toBe(label);
});

test.each([
  { operands: [real(0.1)], actual: 1 },
  { operands: [real(0.1), real(0.2)], actual: 2 },
  { operands: [real(0.1), real(0.2), real(0.3)], actual: 3 },
])("MISSING 時 ($actual 個入り) に pop 済み operand は復元しない (depth=0)", ({
  operands,
  actual,
}) => {
  const ctx = buildContext(operands);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = KHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(beforeDepth).toBe(actual);
  expect(result.error.actual).toBe(actual);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("TYPE_MISMATCH (k 位置 = name) のとき depth は 4 → 3 (1 個 pop 済み)", () => {
  const ctx = buildContext([
    real(0.1),
    real(0.2),
    real(0.3),
    { type: "name", value: "Foo" },
  ]);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = KHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(beforeDepth).toBe(4);
  expect(OperandStack.depth(ctx.operandStack)).toBe(3);
});

test("TYPE_MISMATCH (c 位置 = name) のとき depth は 4 → 0 (4 個全 pop 済み)", () => {
  const ctx = buildContext([
    { type: "name", value: "Foo" },
    real(0.2),
    real(0.3),
    real(0.4),
  ]);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = KHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(beforeDepth).toBe(4);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
