import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
  Matrix,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { closeFillStrokeHandler } from "../../close-fill-stroke";
import { fillStrokeEvenOddHandler } from "../../fill-stroke-even-odd";
import { hHandler } from "../../h";
import { closeFillStrokeEvenOddHandler } from "../index";

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

test("m l 済み path に b* を実行すると currentPath が空になる", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const result = closeFillStrokeEvenOddHandler(context);

  assert(result.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("b* は h + B* と同値", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const closeFillStrokeResult = closeFillStrokeEvenOddHandler(context);
  const closeThenFillStrokeResult = hHandler(context);

  assert(closeFillStrokeResult.ok);
  assert(closeThenFillStrokeResult.ok);
  const expectedResult = fillStrokeEvenOddHandler(
    closeThenFillStrokeResult.value,
  );
  assert(expectedResult.ok);
  expect(
    GraphicsStateStack.current(closeFillStrokeResult.value.graphicsStateStack),
  ).toEqual(
    GraphicsStateStack.current(expectedResult.value.graphicsStateStack),
  );
});

test("closeFillStrokeHandler とは別の関数実体である", () => {
  expect(closeFillStrokeEvenOddHandler).not.toBe(closeFillStrokeHandler);
});

test("operand を pop しない", () => {
  const context = buildContextWithSegments(
    [PathSegment.moveTo(100, 100), PathSegment.lineTo(200, 200)],
    [real(1), real(2)],
  );
  const depthBefore = OperandStack.depth(context.operandStack);
  const peekBefore = OperandStack.peek(context.operandStack);

  const result = closeFillStrokeEvenOddHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(2));
});

test("空 path への b* は no-op で graphicsStateStack を同一参照に保つ", () => {
  const context = buildContext([]);

  const result = closeFillStrokeEvenOddHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

test("currentPath 以外の graphics state を保持する", () => {
  const baseState = GraphicsState.create();
  const path = CurrentPath.append(
    CurrentPath.append(baseState.currentPath, PathSegment.moveTo(100, 100)),
    PathSegment.lineTo(200, 200),
  );
  const seededCtm = Matrix.create(2, 0, 0, 3, 10, 20);
  const seededState = GraphicsState.update(baseState, {
    currentPath: path,
    ctm: seededCtm,
    lineWidth: 5,
  });
  const context = buildContextWithGraphicsState(seededState);

  const result = closeFillStrokeEvenOddHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([]);
  expect(after.ctm).toBe(seededCtm);
  expect(after.lineWidth).toBe(5);
});
