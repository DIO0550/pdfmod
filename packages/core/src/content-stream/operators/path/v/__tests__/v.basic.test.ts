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
import { vHandler } from "../index";

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

const buildOperandStack = (operands: PdfObject[]): OperandStack => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  return operandStack;
};

test("`0 0 m 110 210 120 220 v` は current point を第1制御点にして曲線を追加する", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(110), real(210), real(120), real(220)],
  );

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.curveTo(0, 0, 110, 210, 120, 220),
  ]);
});

test("既存 currentPath を保持し、元の segments を変更せずに曲線を追加する", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(10, 20), PathSegment.lineTo(30, 40)],
    [real(100), real(200), real(300), real(400)],
  );
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);
  const beforeSegments = before.currentPath.segments;

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
    PathSegment.curveTo(30, 40, 100, 200, 300, 400),
  ]);
  expect(before.currentPath.segments).toBe(beforeSegments);
  expect(beforeSegments).toEqual([
    PathSegment.moveTo(10, 20),
    PathSegment.lineTo(30, 40),
  ]);
});

test("`mHandler(100,200)` の後の v は m の座標を第1制御点にする", () => {
  const moveResult = mHandler(buildContext([real(100), real(200)]));
  assert(moveResult.ok);
  const operandStack = buildOperandStack([
    real(110),
    real(210),
    real(120),
    real(220),
  ]);

  const result = vHandler({
    operandStack,
    graphicsStateStack: moveResult.value.graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(100, 200),
    PathSegment.curveTo(100, 200, 110, 210, 120, 220),
  ]);
});

test("末尾 curveTo の終点を v の第1制御点にする", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(10, 20), PathSegment.curveTo(30, 40, 50, 60, 70, 80)],
    [real(100), real(200), real(300), real(400)],
  );

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments.at(-1)).toEqual(
    PathSegment.curveTo(70, 80, 100, 200, 300, 400),
  );
});

test("末尾 close の後は subpath 開始点を v の第1制御点にする", () => {
  const ctx = buildContextWithSegments(
    [
      PathSegment.moveTo(10, 20),
      PathSegment.lineTo(30, 40),
      PathSegment.close(),
    ],
    [real(100), real(200), real(300), real(400)],
  );

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments.at(-1)).toEqual(
    PathSegment.curveTo(10, 20, 100, 200, 300, 400),
  );
});

test("末尾 rect の左下を v の第1制御点にする", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.rect(10, 20, 100, 50)],
    [real(100), real(200), real(300), real(400)],
  );

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments.at(-1)).toEqual(
    PathSegment.curveTo(10, 20, 100, 200, 300, 400),
  );
});

test("v を連続適用すると2個目の第1制御点は1個目の終点になる", () => {
  const firstContext = buildContextWithSegments(
    [PathSegment.moveTo(10, 20)],
    [real(100), real(200), real(300), real(400)],
  );
  const firstResult = vHandler(firstContext);
  assert(firstResult.ok);
  const secondOperandStack = buildOperandStack([
    real(500),
    real(600),
    real(700),
    real(800),
  ]);

  const secondResult = vHandler({
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
    PathSegment.curveTo(10, 20, 100, 200, 300, 400),
    PathSegment.curveTo(300, 400, 500, 600, 700, 800),
  ]);
});

test("integer と real の operand を混在させても数値として格納する", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [int(110), real(210.5), int(120), real(220.25)],
  );

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments.at(-1)).toEqual(
    PathSegment.curveTo(0, 0, 110, 210.5, 120, 220.25),
  );
});

test("成功時に operand stack を使い切り、入力と同一参照を返す", () => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(1), real(2), real(3), real(4)],
  );

  const result = vHandler(ctx);

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

  const result = vHandler(ctx);

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
])("境界値 $label を v の y3 に渡してもそのまま格納する", ({ value }) => {
  const ctx = buildContextWithSegments(
    [PathSegment.moveTo(0, 0)],
    [real(100), real(200), real(300), real(value)],
  );

  const result = vHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments.at(-1)).toEqual(
    PathSegment.curveTo(0, 0, 100, 200, 300, value),
  );
});
