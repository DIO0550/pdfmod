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
import { fillStrokeHandler } from "../../fill-stroke";
import { hHandler } from "../../h";
import { closeFillStrokeHandler } from "../index";

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

test("m l 済み path に b を実行すると currentPath が空になる", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const result = closeFillStrokeHandler(context);

  assert(result.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("b は h + B と同値", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 100),
    PathSegment.lineTo(200, 200),
  ]);

  const closeFillStrokeResult = closeFillStrokeHandler(context);
  const closeThenFillStrokeResult = hHandler(context);

  assert(closeFillStrokeResult.ok);
  assert(closeThenFillStrokeResult.ok);
  const expectedResult = fillStrokeHandler(closeThenFillStrokeResult.value);
  assert(expectedResult.ok);
  expect(
    GraphicsStateStack.current(closeFillStrokeResult.value.graphicsStateStack),
  ).toEqual(
    GraphicsStateStack.current(expectedResult.value.graphicsStateStack),
  );
});

test("operand を pop しない", () => {
  const context = buildContextWithSegments(
    [PathSegment.moveTo(100, 100), PathSegment.lineTo(200, 100)],
    [real(1), real(2)],
  );
  const depthBefore = OperandStack.depth(context.operandStack);
  const peekBefore = OperandStack.peek(context.operandStack);

  const result = closeFillStrokeHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(2));
});

test("空 path への b は no-op で graphicsStateStack を同一参照に保つ", () => {
  const context = buildContext([]);

  const result = closeFillStrokeHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

test("入力 context の currentPath を mutate しない", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 100),
  ]);
  const beforePath = GraphicsStateStack.current(
    context.graphicsStateStack,
  ).currentPath;

  const result = closeFillStrokeHandler(context);

  assert(result.ok);
  expect(beforePath.segments).toEqual([
    PathSegment.moveTo(100, 100),
    PathSegment.lineTo(200, 100),
  ]);
  expect(result.value.graphicsStateStack).not.toBe(context.graphicsStateStack);
});

test("q 済みの saved graphics state を保持する", () => {
  const savedState = GraphicsState.update(GraphicsState.create(), {
    ctm: Matrix.create(2, 0, 0, 3, 10, 20),
    lineWidth: 5,
  });
  const savedStack = GraphicsStateStack.save(
    GraphicsStateStack.replaceCurrent(GraphicsStateStack.create(), savedState),
  );
  const currentPath = CurrentPath.append(
    savedState.currentPath,
    PathSegment.moveTo(0, 0),
  );
  const currentState = GraphicsState.update(savedState, {
    currentPath,
  });
  const stack = GraphicsStateStack.replaceCurrent(savedStack, currentState);
  const context: OperatorHandlerContext = {
    operandStack: OperandStack.create(),
    graphicsStateStack: stack,
    markedContentStack: MarkedContentStack.create(),
  };

  const result = closeFillStrokeHandler(context);
  assert(result.ok);
  const restored = GraphicsStateStack.restore(result.value.graphicsStateStack);

  expect(GraphicsStateStack.current(restored.stack)).toEqual(savedState);
});
