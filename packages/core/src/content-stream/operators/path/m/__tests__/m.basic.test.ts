import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { mHandler } from "../index";

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

const real = (value: number): PdfObject => ({ type: "real", value });
const int = (value: number): PdfObject => ({ type: "integer", value });

test("`100 200 m` で MoveTo(100, 200) が空 currentPath に append される", () => {
  const ctx = buildContext([real(100), real(200)]);

  const result = mHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([PathSegment.moveTo(100, 200)]);
});

test("既存 currentPath を持つ state から開始した場合、元 segment が保持され末尾に moveTo が追加される", () => {
  const initialState = GraphicsState.create();
  const seededPath = CurrentPath.append(
    CurrentPath.append(initialState.currentPath, PathSegment.moveTo(10, 20)),
    PathSegment.lineTo(30, 40),
  );
  const seededState = GraphicsState.update(initialState, {
    currentPath: seededPath,
  });
  const beforeSegments = seededPath.segments;

  const operandStack = OperandStack.create();
  for (const operand of [real(100), real(200)]) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  const stackWithSeed = GraphicsStateStack.replaceCurrent(
    graphicsStateStack,
    seededState,
  );

  const result = mHandler({
    operandStack,
    graphicsStateStack: stackWithSeed,
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.moveTo(100, 200),
  ]);
  expect(beforeSegments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
  ]);
});

test("integer / real 混在 operand が許容される (int(100) + real(200.5))", () => {
  const ctx = buildContext([int(100), real(200.5)]);

  const result = mHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(100, 200.5),
  ]);
});

test("成功時 operandStack の depth は 0", () => {
  const ctx = buildContext([real(100), real(200)]);

  const result = mHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時 result.value.operandStack は context.operandStack と同一参照 (in-place mutate)", () => {
  const ctx = buildContext([real(100), real(200)]);

  const result = mHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時 ctm / lineWidth / lineCap / lineJoin / miterLimit は不変", () => {
  const ctx = buildContext([real(100), real(200)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = mHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toBe(before.lineCap);
  expect(after.lineJoin).toBe(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
});

test.each([
  { label: "0", value: 0 },
  { label: "negative", value: -1.5 },
  { label: "NaN", value: Number.NaN },
  { label: "Positive Infinity", value: Number.POSITIVE_INFINITY },
  { label: "Negative Infinity", value: Number.NEGATIVE_INFINITY },
])("境界値 $label が混入しても handler では検証せずそのまま MoveTo に格納する", ({
  value,
}) => {
  const ctx = buildContext([real(100), real(value)]);

  const result = mHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(100, value),
  ]);
});

test.each([
  { label: "0 個", count: 0 },
  { label: "1 個", count: 1 },
])("operand $label のとき OPERAND_MISSING を返し actual = pop 成功数", ({
  count,
}) => {
  const operands: PdfObject[] = Array.from({ length: count }, () => real(1));
  const ctx = buildContext(operands);

  const result = mHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("m");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(count);
  expect(result.error.message).toBe(
    `Operator 'm' requires 2 operand(s), got ${count}`,
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
])("top (PDF 順 y) が $label のとき TYPE_MISMATCH を返し depth は 1 (top のみ pop 済み)", ({
  label,
  operand,
}) => {
  const ctx = buildContext([real(100), operand]);

  const result = mHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("m");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'm' expected number operand, got ${label}`,
  );
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
});

test("bottom (PDF 順 x) が boolean のとき TYPE_MISMATCH を返し depth は 0 (2 個 pop 済み)", () => {
  const bottom: PdfObject = { type: "boolean", value: true };
  const ctx = buildContext([bottom, real(200)]);

  const result = mHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("TYPE_MISMATCH 時に部分消費した operand stack は復元しない (depth が 1 減ったまま)", () => {
  const operands: PdfObject[] = [real(100), { type: "name", value: "Foo" }];
  const ctx = buildContext(operands);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = mHandler(ctx);

  assert(!result.ok);
  expect(beforeDepth).toBe(2);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
});
