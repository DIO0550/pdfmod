import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  CurrentPath,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { yHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  return {
    operandStack,
    graphicsStateStack: GraphicsStateStack.create(),
    markedContentStack: MarkedContentStack.create(),
  };
};

test.each([
  { label: "0 個", count: 0 },
  { label: "1 個", count: 1 },
  { label: "2 個", count: 2 },
  { label: "3 個", count: 3 },
])("operand $label のとき OPERATOR_OPERAND_MISSING を返す", ({ count }) => {
  const operands: PdfObject[] = Array.from({ length: count }, () => real(1));
  const ctx = buildContext(operands);

  const result = yHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("y");
  expect(result.error.required).toBe(4);
  expect(result.error.actual).toBe(count);
  expect(result.error.message).toBe(
    `Operator 'y' requires 4 operand(s), got ${count}`,
  );
});

test.each([
  { label: "null", operand: { type: "null" } satisfies PdfObject },
  {
    label: "name",
    operand: { type: "name", value: "Foo" } satisfies PdfObject,
  },
  {
    label: "boolean",
    operand: { type: "boolean", value: true } satisfies PdfObject,
  },
  {
    label: "string",
    operand: {
      type: "string",
      value: new Uint8Array([0x61]),
      encoding: "literal",
    } satisfies PdfObject,
  },
  {
    label: "array",
    operand: { type: "array", elements: [] } satisfies PdfObject,
  },
  {
    label: "dictionary",
    operand: { type: "dictionary", entries: new Map() } satisfies PdfObject,
  },
  {
    label: "indirect-ref",
    operand: {
      type: "indirect-ref",
      objectNumber: 1,
      generationNumber: 0,
    } satisfies PdfObject,
  },
  {
    label: "stream",
    operand: {
      type: "stream",
      dictionary: { type: "dictionary", entries: new Map() },
      data: new Uint8Array(),
    } satisfies PdfObject,
  },
])("top operand が $label のとき TYPE_MISMATCH を返す", ({
  label,
  operand,
}) => {
  const ctx = buildContext([real(100), real(200), real(300), operand]);

  const result = yHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("y");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'y' expected number operand, got ${label}`,
  );
  expect(OperandStack.depth(ctx.operandStack)).toBe(3);
});

test("最下位 operand が boolean のとき TYPE_MISMATCH を返し全4個を消費する", () => {
  const bottom: PdfObject = { type: "boolean", value: true };
  const ctx = buildContext([bottom, real(200), real(300), real(400)]);

  const result = yHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("y");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("中間 operand の型不一致では部分消費を復元しない", () => {
  const middle: PdfObject = { type: "name", value: "Foo" };
  const ctx = buildContext([real(100), real(200), middle, real(400)]);

  const result = yHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("name");
  expect(OperandStack.depth(ctx.operandStack)).toBe(2);
});

test("current point 未確立のとき座標を使わなくても PATH_NO_CURRENT_POINT を返す", () => {
  const ctx = buildContext([real(100), real(200), real(300), real(400)]);

  const result = yHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_PATH_NO_CURRENT_POINT");
  expect(result.error.operatorName).toBe("y");
  expect(result.error.message).toBe(
    "Operator 'y' requires a current point established by a prior 'm' or 're'",
  );
});

test("current point 未確立時も path は空のまま、operand stack は復元しない", () => {
  const ctx = buildContext([real(100), real(200), real(300), real(400)]);

  const result = yHandler(ctx);

  assert(!result.ok);
  const current = GraphicsStateStack.current(ctx.graphicsStateStack);
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
