import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
  LineCap,
  LineJoin,
  Matrix,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { hHandler } from "../../h";
import { strokeHandler } from "../../stroke";
import { closeStrokeHandler } from "../index";

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

const buildContextWithGraphicsState = (
  state: GraphicsState,
  operands: PdfObject[] = [],
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    state,
  );
  return {
    operandStack,
    graphicsStateStack,
    markedContentStack: MarkedContentStack.create(),
  };
};

test("m l 済み path に s を実行すると currentPath が空になる", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const result = closeStrokeHandler(context);

  assert(result.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("s は h + S と同値", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const closeStrokeResult = closeStrokeHandler(context);
  const closeThenStrokeResult = hHandler(context);

  assert(closeStrokeResult.ok);
  assert(closeThenStrokeResult.ok);
  const expectedResult = strokeHandler(closeThenStrokeResult.value);
  assert(expectedResult.ok);
  expect(
    GraphicsStateStack.current(closeStrokeResult.value.graphicsStateStack),
  ).toEqual(
    GraphicsStateStack.current(expectedResult.value.graphicsStateStack),
  );
});

test("operand を pop しない", () => {
  const context = buildContextWithSegments(
    [PathSegment.moveTo(100, 100), PathSegment.lineTo(200, 200)],
    [real(1), real(2)],
  );
  const depthBefore = OperandStack.depth(context.operandStack);
  const peekBefore = OperandStack.peek(context.operandStack);

  const result = closeStrokeHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(2));
});

test("currentPath 以外の graphics state を保持する", () => {
  const baseState = GraphicsState.create();
  const path = CurrentPath.append(
    CurrentPath.append(baseState.currentPath, PathSegment.moveTo(100, 100)),
    PathSegment.lineTo(200, 200),
  );
  const seededCtm = Matrix.create(2, 0, 0, 3, 10, 20);
  const seededLineCap = LineCap.create(1);
  const seededLineJoin = LineJoin.create(2);
  const seededState = GraphicsState.update(baseState, {
    currentPath: path,
    ctm: seededCtm,
    lineWidth: 3.5,
    lineCap: seededLineCap,
    lineJoin: seededLineJoin,
    miterLimit: 8,
  });
  const context = buildContextWithGraphicsState(seededState);

  const result = closeStrokeHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([]);
  expect(after.ctm).toBe(seededCtm);
  expect(after.lineWidth).toBe(3.5);
  expect(after.lineCap).toBe(seededLineCap);
  expect(after.lineJoin).toBe(seededLineJoin);
  expect(after.miterLimit).toBe(8);
});

test("空 path への s は no-op で graphicsStateStack を同一参照に保つ", () => {
  const context = buildContext([]);

  const result = closeStrokeHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("s を連続実行すると 2 回目は no-op で成功する", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const first = closeStrokeHandler(context);
  assert(first.ok);
  const second = closeStrokeHandler(first.value);

  assert(second.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(second.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("入力 context の currentPath を mutate しない", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);
  const beforePath = GraphicsStateStack.current(
    context.graphicsStateStack,
  ).currentPath;

  const result = closeStrokeHandler(context);

  assert(result.ok);
  expect(beforePath.segments).toEqual([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);
  expect(result.value.graphicsStateStack).not.toBe(context.graphicsStateStack);
});
