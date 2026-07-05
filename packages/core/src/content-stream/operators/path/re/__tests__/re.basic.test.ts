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
import { reHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });
const int = (value: number): PdfObject => ({ type: "integer", value });

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

const buildContextWithSegments = (
  segments: PathSegment[],
  operands: PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const initialState = GraphicsState.create();
  let path = initialState.currentPath;
  for (const segment of segments) {
    path = CurrentPath.append(path, segment);
  }
  const seededState = GraphicsState.update(initialState, { currentPath: path });
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

test("`100 100 200 150 re` で PathSegment.rect(100,100,200,150) が空 currentPath に append される", () => {
  const ctx = buildContext([real(100), real(100), real(200), real(150)]);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.rect(100, 100, 200, 150),
  ]);
});

test("`10 20 30 40 re` で x=10 / y=20 / width=30 / height=40 が PDF 順で格納される", () => {
  const ctx = buildContext([real(10), real(20), real(30), real(40)]);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  const [segment] = current.currentPath.segments;
  assert(segment.kind === "rect");
  expect(segment.x).toBe(10);
  expect(segment.y).toBe(20);
  expect(segment.width).toBe(30);
  expect(segment.height).toBe(40);
});

test("成功時 operandStack の depth は 0 かつ result.value.operandStack は同一参照", () => {
  const ctx = buildContext([real(1), real(2), real(3), real(4)]);

  const result = reHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("integer / real 混在 operand (int(100) real(150.5) int(200) real(75.25)) が許容される", () => {
  const ctx = buildContext([int(100), real(150.5), int(200), real(75.25)]);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.rect(100, 150.5, 200, 75.25),
  ]);
});

test("既存 currentPath ([moveTo, lineTo, curveTo]) の末尾に rect が追加され元 segments が保持される", () => {
  const ctx = buildContextWithSegments(
    [
      PathSegment.moveTo(10, 20),
      PathSegment.lineTo(30, 40),
      PathSegment.curveTo(50, 60, 70, 80, 90, 100),
    ],
    [real(200), real(300), real(40), real(60)],
  );

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.curveTo(50, 60, 70, 80, 90, 100),
    PathSegment.rect(200, 300, 40, 60),
  ]);
});

test("成功時 ctm / lineWidth / lineCap / lineJoin / miterLimit は不変", () => {
  const ctx = buildContext([real(0), real(0), real(100), real(100)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = reHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toEqual(before.lineCap);
  expect(after.lineJoin).toEqual(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
});

test("width / height が 0 でも rect(0,0,0,0) がそのまま append される (reject しない)", () => {
  const ctx = buildContext([real(0), real(0), real(0), real(0)]);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([PathSegment.rect(0, 0, 0, 0)]);
});

test("width / height が負値 (-50 / -100) でも rect(100,100,-50,-100) がそのまま append される", () => {
  const ctx = buildContext([real(100), real(100), real(-50), real(-100)]);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.rect(100, 100, -50, -100),
  ]);
});

test.each([
  { label: "NaN at x", x: Number.NaN, y: 0, w: 0, h: 0 },
  { label: "NaN at y", x: 0, y: Number.NaN, w: 0, h: 0 },
  {
    label: "+Infinity at width",
    x: 0,
    y: 0,
    w: Number.POSITIVE_INFINITY,
    h: 0,
  },
  {
    label: "-Infinity at width",
    x: 0,
    y: 0,
    w: Number.NEGATIVE_INFINITY,
    h: 0,
  },
  {
    label: "+Infinity at height",
    x: 0,
    y: 0,
    w: 0,
    h: Number.POSITIVE_INFINITY,
  },
  {
    label: "-Infinity at height",
    x: 0,
    y: 0,
    w: 0,
    h: Number.NEGATIVE_INFINITY,
  },
])("$label が混入しても検証せずそのまま格納する", ({ x, y, w, h }) => {
  const ctx = buildContext([real(x), real(y), real(w), real(h)]);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([PathSegment.rect(x, y, w, h)]);
});

test("空 currentPath (current point 未確立) でも `re` は正常に append される", () => {
  const ctx = buildContext([real(10), real(20), real(30), real(40)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);
  expect(CurrentPath.isEmpty(before.currentPath)).toBe(true);

  const result = reHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.rect(10, 20, 30, 40),
  ]);
});

test.each([
  { label: "0 個", count: 0 },
  { label: "1 個", count: 1 },
  { label: "2 個", count: 2 },
  { label: "3 個", count: 3 },
])("operand $label のとき OPERAND_MISSING を返し actual = pop 成功数", ({
  count,
}) => {
  const operands: PdfObject[] = Array.from({ length: count }, () => real(1));
  const ctx = buildContext(operands);

  const result = reHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_MISSING");
  expect(result.error.operatorName).toBe("re");
  expect(result.error.required).toBe(4);
  expect(result.error.actual).toBe(count);
  expect(result.error.message).toBe(
    `Operator 're' requires 4 operand(s), got ${count}`,
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
])("top (PDF 順 height) が $label のとき TYPE_MISMATCH を返し depth は 3 (top のみ pop 済み)", ({
  label,
  operand,
}) => {
  const ctx = buildContext([real(100), real(100), real(200), operand]);

  const result = reHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.operatorName).toBe("re");
  expect(result.error.expected).toBe("number");
  expect(result.error.actual).toBe(label);
  expect(result.error.message).toBe(
    `Operator 're' expected number operand, got ${label}`,
  );
  expect(OperandStack.depth(ctx.operandStack)).toBe(3);
});

test("LIFO 2 個目 (PDF 順 width) が boolean のとき TYPE_MISMATCH を返し depth は 2 (部分消費の復元なし)", () => {
  const bad: PdfObject = { type: "boolean", value: true };
  const ctx = buildContext([real(100), real(100), bad, real(150)]);

  const result = reHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(2);
});

test("LIFO 3 個目 (PDF 順 y) が boolean のとき TYPE_MISMATCH を返し depth は 1", () => {
  const bad: PdfObject = { type: "boolean", value: true };
  const ctx = buildContext([real(100), bad, real(200), real(150)]);

  const result = reHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(1);
});

test("LIFO 4 個目 (PDF 順 x = bottom) が boolean のとき TYPE_MISMATCH を返し depth は 0 (4 個 pop 済み)", () => {
  const bad: PdfObject = { type: "boolean", value: true };
  const ctx = buildContext([bad, real(100), real(200), real(150)]);

  const result = reHandler(ctx);

  assert(!result.ok);
  assert(result.error.code === "OPERATOR_OPERAND_TYPE_MISMATCH");
  expect(result.error.actual).toBe("boolean");
  expect(OperandStack.depth(ctx.operandStack)).toBe(0);
});
