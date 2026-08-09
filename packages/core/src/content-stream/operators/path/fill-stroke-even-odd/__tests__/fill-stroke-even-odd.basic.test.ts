import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
  LineJoin,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment";
import { MarkedContentStack } from "../../../../marked-content/stack";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { fillStrokeHandler } from "../../fill-stroke";
import { fillStrokeEvenOddHandler } from "../index";

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

test("re 済み path に B* を実行すると currentPath が空になる", () => {
  const context = buildContextWithSegments([
    PathSegment.rect(100, 100, 200, 150),
  ]);

  const result = fillStrokeEvenOddHandler(context);

  assert(result.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("fillStrokeHandler と同じ state 更新結果になる", () => {
  const context = buildContextWithSegments([
    PathSegment.rect(100, 100, 200, 150),
  ]);

  const evenOddResult = fillStrokeEvenOddHandler(context);
  const nonzeroResult = fillStrokeHandler(context);

  assert(evenOddResult.ok);
  assert(nonzeroResult.ok);
  expect(
    GraphicsStateStack.current(evenOddResult.value.graphicsStateStack),
  ).toEqual(GraphicsStateStack.current(nonzeroResult.value.graphicsStateStack));
});

test("fillStrokeHandler とは別の関数実体である", () => {
  expect(fillStrokeEvenOddHandler).not.toBe(fillStrokeHandler);
});

test("operand を pop しない", () => {
  const context = buildContextWithSegments(
    [PathSegment.rect(100, 100, 200, 150)],
    [real(1), real(2)],
  );
  const depthBefore = OperandStack.depth(context.operandStack);
  const peekBefore = OperandStack.peek(context.operandStack);

  const result = fillStrokeEvenOddHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(2));
});

test("空 path への B* は no-op で graphicsStateStack を同一参照に保つ", () => {
  const context = buildContext([]);

  const result = fillStrokeEvenOddHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
});

test("miterLimit / lineJoin を保持する", () => {
  const baseState = GraphicsState.create();
  const path = CurrentPath.append(
    baseState.currentPath,
    PathSegment.rect(100, 100, 200, 150),
  );
  const seededLineJoin = LineJoin.create(2);
  const seededState = GraphicsState.update(baseState, {
    currentPath: path,
    lineJoin: seededLineJoin,
    miterLimit: 8,
  });
  const context = buildContextWithGraphicsState(seededState);

  const result = fillStrokeEvenOddHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([]);
  expect(after.lineJoin).toBe(seededLineJoin);
  expect(after.miterLimit).toBe(8);
});
