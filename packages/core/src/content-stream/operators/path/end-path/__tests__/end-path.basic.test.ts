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
import { fillHandler } from "../../fill";
import { fillStrokeHandler } from "../../fill-stroke";
import { strokeHandler } from "../../stroke";
import { endPathHandler } from "../index";

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

test("re 済み path に n を実行すると currentPath が空になる", () => {
  const context = buildContextWithSegments([
    PathSegment.rect(100, 100, 300, 400),
  ]);

  const result = endPathHandler(context);

  assert(result.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("m l close 済みの閉じた path も n で破棄できる", () => {
  const context = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(10, 10),
    PathSegment.close(),
  ]);

  const result = endPathHandler(context);

  assert(result.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("fillHandler / strokeHandler / fillStrokeHandler とは別の関数実体である", () => {
  expect(endPathHandler).not.toBe(fillHandler);
  expect(endPathHandler).not.toBe(strokeHandler);
  expect(endPathHandler).not.toBe(fillStrokeHandler);
});

test("operand を pop しない", () => {
  const context = buildContextWithSegments(
    [PathSegment.rect(100, 100, 300, 400)],
    [real(1), real(2)],
  );
  const depthBefore = OperandStack.depth(context.operandStack);
  const peekBefore = OperandStack.peek(context.operandStack);

  const result = endPathHandler(context);

  assert(result.ok);
  expect(result.value.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(2));
});

test("空 path への n は no-op で graphicsStateStack を同一参照に保つ", () => {
  const context = buildContext([]);

  const result = endPathHandler(context);

  assert(result.ok);
  expect(result.value.graphicsStateStack).toBe(context.graphicsStateStack);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(result.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});

test("graphics state の全フィールドを保持する", () => {
  const baseState = GraphicsState.create();
  const path = CurrentPath.append(
    baseState.currentPath,
    PathSegment.rect(100, 100, 300, 400),
  );
  const seededCtm = Matrix.create(2, 0, 0, 3, 10, 20);
  const seededLineCap = LineCap.create(2);
  const seededLineJoin = LineJoin.create(2);
  const seededState = GraphicsState.update(baseState, {
    currentPath: path,
    ctm: seededCtm,
    lineWidth: 5,
    lineCap: seededLineCap,
    lineJoin: seededLineJoin,
    miterLimit: 20,
  });
  const context = buildContextWithGraphicsState(seededState);

  const result = endPathHandler(context);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([]);
  expect(after.ctm).toBe(seededCtm);
  expect(after.lineWidth).toBe(5);
  expect(after.lineCap).toBe(seededLineCap);
  expect(after.lineJoin).toBe(seededLineJoin);
  expect(after.miterLimit).toBe(20);
});

test("n を連続実行しても 2 回目は no-op で成功する", () => {
  const context = buildContextWithSegments([
    PathSegment.rect(100, 100, 300, 400),
  ]);

  const first = endPathHandler(context);
  assert(first.ok);
  const second = endPathHandler(first.value);

  assert(second.ok);
  expect(
    CurrentPath.isEmpty(
      GraphicsStateStack.current(second.value.graphicsStateStack).currentPath,
    ),
  ).toBe(true);
});
