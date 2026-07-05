import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { mHandler } from "../../m/index";
import { lHandler } from "../index";

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

const buildContextWithCurrentPoint = (
  operands: PdfObject[],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const initialState = GraphicsState.create();
  const seededPath = CurrentPath.append(
    initialState.currentPath,
    PathSegment.moveTo(0, 0),
  );
  const seededState = GraphicsState.update(initialState, {
    currentPath: seededPath,
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    seededState,
  );
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

const real = (value: number): PdfObject => ({ type: "real", value });
const int = (value: number): PdfObject => ({ type: "integer", value });

test("`100 200 l` で LineTo(100, 200) が current point 確立済み path に append される", () => {
  const ctx = buildContextWithCurrentPoint([real(100), real(200)]);

  const result = lHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
  ]);
});

test("既存 currentPath を持つ state から開始した場合、元 segment が保持され末尾に lineTo が追加される", () => {
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

  const result = lHandler({
    operandStack,
    graphicsStateStack: stackWithSeed,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.lineTo(100, 200),
  ]);
  expect(beforeSegments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
  ]);
});

test("`mHandler(10,20)` 実行後 `lHandler(30,40)` を実行すると [MoveTo, LineTo] になる", () => {
  const mCtx = buildContext([real(10), real(20)]);
  const mResult = mHandler(mCtx);
  assert(mResult.ok);

  const operandStack = OperandStack.create();
  for (const operand of [real(30), real(40)]) {
    OperandStack.push(operandStack, operand);
  }
  const result = lHandler({
    operandStack,
    graphicsStateStack: mResult.value.graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
  ]);
});

test("連続 `l → l` で 2 つの LineTo が append され、前 LineTo は上書きされない", () => {
  const firstCtx = buildContextWithCurrentPoint([real(10), real(20)]);
  const firstResult = lHandler(firstCtx);
  assert(firstResult.ok);

  const operandStack = OperandStack.create();
  for (const operand of [real(30), real(40)]) {
    OperandStack.push(operandStack, operand);
  }
  const secondResult = lHandler({
    operandStack,
    graphicsStateStack: firstResult.value.graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(secondResult.ok);
  const current = GraphicsStateStack.current(
    secondResult.value.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(10, 20),
    PathSegment.lineTo(30, 40),
  ]);
});

test("integer / real 混在 operand が許容される (int(10) + real(20.5))", () => {
  const ctx = buildContextWithCurrentPoint([int(10), real(20.5)]);

  const result = lHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(10, 20.5),
  ]);
});

test("成功時 operandStack の depth は 0", () => {
  const ctx = buildContextWithCurrentPoint([real(100), real(200)]);

  const result = lHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("成功時 result.value.operandStack は context.operandStack と同一参照 (in-place mutate)", () => {
  const ctx = buildContextWithCurrentPoint([real(100), real(200)]);

  const result = lHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時 ctm / lineWidth / lineCap / lineJoin / miterLimit は不変", () => {
  const ctx = buildContextWithCurrentPoint([real(100), real(200)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = lHandler(ctx);

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
])("境界値 $label が混入しても handler では検証せずそのまま LineTo に格納する", ({
  value,
}) => {
  const ctx = buildContextWithCurrentPoint([real(100), real(value)]);

  const result = lHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, value),
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

  const result = lHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("l");
  expect(result.error.required).toBe(2);
  expect(result.error.actual).toBe(count);
  expect(result.error.message).toBe(
    `Operator 'l' requires 2 operand(s), got ${count}`,
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
])("top (PDF 順 y) が $label のとき TYPE_MISMATCH を返し depth は 1 (top のみ pop 済み)", ({
  label,
  operand,
}) => {
  const ctx = buildContext([real(100), operand]);

  const result = lHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("l");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 'l' expected number operand, got ${label}`,
  );
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
});

test("bottom (PDF 順 x) が boolean のとき TYPE_MISMATCH を返し depth は 0 (2 個 pop 済み)", () => {
  const bottom: PdfObject = { type: "boolean", value: true };
  const ctx = buildContext([bottom, real(200)]);

  const result = lHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});

test("TYPE_MISMATCH 時に部分消費した operand stack は復元しない (depth が 1 減ったまま)", () => {
  const operands: PdfObject[] = [real(100), { type: "name", value: "Foo" }];
  const ctx = buildContext(operands);
  const beforeDepth = OperandStack.depth(ctx.operandStack);

  const result = lHandler(ctx);

  assert(!result.ok);
  expect(beforeDepth).toBe(2);
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
});

test("current point 未確立 (currentPath が空) のとき NO_CURRENT_POINT を返し path に append しない", () => {
  const ctx = buildContext([real(100), real(200)]);

  const result = lHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_PATH_NO_CURRENT_POINT");
  expect(result.error.operatorName).toBe("l");
  expect(result.error.message).toBe(
    "Operator 'l' requires a current point established by a prior 'm' or 're'",
  );
  const current = GraphicsStateStack.current(ctx.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("NO_CURRENT_POINT 時に operand stack は (TYPE_MISMATCH と同様) 復元しない", () => {
  const ctx = buildContext([real(100), real(200)]);

  const result = lHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_PATH_NO_CURRENT_POINT");
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
