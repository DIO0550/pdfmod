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
import { yHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });
const int = (value: number): PdfObject => ({ type: "integer", value });

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

const buildOperandStack = (operands: PdfObject[]): OperandStack => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  return operandStack;
};

test("`0 0 m 110 210 120 220 y` は第2制御点を終点にして曲線を追加する", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(110), real(210), real(120), real(220)],
  );

  const result = yHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.curveTo(110, 210, 120, 220, 120, 220),
  ]);
});

test("y の第2制御点は常に終点と同じ x3 / y3 になる", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(10, 20)],
    [real(100), real(200), real(300), real(400)],
  );

  const result = yHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments[1]).toEqual(
    PathSegment.curveTo(100, 200, 300, 400, 300, 400),
  );
});

test("current point の座標が異なっても同じ operand から同じ曲線を生成する", () => {
  const firstResult = yHandler(
    buildContextWithSegments(
      [PathSegment.moveTo(0, 0)],
      [real(100), real(200), real(300), real(400)],
    ),
  );
  const secondResult = yHandler(
    buildContextWithSegments(
      [PathSegment.moveTo(900, 800)],
      [real(100), real(200), real(300), real(400)],
    ),
  );

  assert(firstResult.ok);
  assert(secondResult.ok);
  const firstCurrent = GraphicsStateStack.current(
    firstResult.value.graphicsStateStack,
  );
  const secondCurrent = GraphicsStateStack.current(
    secondResult.value.graphicsStateStack,
  );
  expect(firstCurrent.currentPath.segments[1]).toEqual(
    secondCurrent.currentPath.segments[1],
  );
});

test("既存 currentPath を保持し、元の segments を変更せずに曲線を追加する", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(10, 20), PathSegment.lineTo(30, 40)],
    [real(100), real(200), real(300), real(400)],
  );
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);
  const beforeSegments = before.currentPath.segments;

  const result = yHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.curveTo(100, 200, 300, 400, 300, 400),
  ]);
  expect(before.currentPath.segments).toBe(beforeSegments);
  expect(beforeSegments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
  ]);
});

test("y を連続適用すると2個の曲線を順に append する", () => {
  const firstContext = buildContextWithSegments(
    [PathSegment.moveTo(10, 20)],
    [real(100), real(200), real(300), real(400)],
  );
  const firstResult = yHandler(firstContext);
  assert(firstResult.ok);
  const secondOperandStack = buildOperandStack([
    real(500),
    real(600),
    real(700),
    real(800),
  ]);

  const secondResult = yHandler({
    operandStack: secondOperandStack,
    graphicsStateStack: firstResult.value.graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(secondResult.ok);
  const current = GraphicsStateStack.current(
    secondResult.value.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.curveTo(100, 200, 300, 400, 300, 400),
    PathSegment.curveTo(500, 600, 700, 800, 700, 800),
  ]);
});

test("integer と real の operand を混在させても数値として格納する", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [int(110), real(210.5), int(120), real(220.25)],
  );

  const result = yHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments[1]).toEqual(
    PathSegment.curveTo(110, 210.5, 120, 220.25, 120, 220.25),
  );
});

test("成功時に operand stack を使い切り、入力と同一参照を返す", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(1), real(2), real(3), real(4)],
  );

  const result = yHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時に ctm と graphics state の線属性は不変", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(1), real(2), real(3), real(4)],
  );
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = yHandler(ctx);

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
])("境界値 $label を y の y3 に渡してもそのまま格納する", ({ value }) => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(100), real(200), real(300), real(value)],
  );

  const result = yHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments[1]).toEqual(
    PathSegment.curveTo(100, 200, 300, value, 300, value),
  );
});
