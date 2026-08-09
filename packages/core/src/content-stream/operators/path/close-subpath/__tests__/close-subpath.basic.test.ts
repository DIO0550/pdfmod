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
import { closeSubpathContext } from "../index";

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
): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
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

test("m 済み context に適用すると currentPath に close が付く", () => {
  const context = buildContextWithSegments([PathSegment.moveTo(0, 0)]);

  const closed = closeSubpathContext(context);

  const current = GraphicsStateStack.current(closed.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.close(),
  ]);
});
test("currentPath 以外の graphics state を保持する", () => {
  const baseState = GraphicsState.create();
  const path = CurrentPath.append(
    baseState.currentPath,
    PathSegment.moveTo(0, 0),
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

  const closed = closeSubpathContext(context);

  const after = GraphicsStateStack.current(closed.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.close(),
  ]);
  expect(after.ctm).toBe(seededCtm);
  expect(after.lineWidth).toBe(5);
  expect(after.lineCap).toBe(seededLineCap);
  expect(after.lineJoin).toBe(seededLineJoin);
  expect(after.miterLimit).toBe(20);
});

test("operand stack を pop せず同一参照を返す", () => {
  const context = buildContext([real(1), real(2)]);
  const depthBefore = OperandStack.depth(context.operandStack);
  const peekBefore = OperandStack.peek(context.operandStack);

  const closed = closeSubpathContext(context);

  expect(closed.operandStack).toBe(context.operandStack);
  expect(OperandStack.depth(closed.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(closed.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(2));
});

test("空 path では引数 context を同一参照で返す", () => {
  const context = buildContext([]);
  const closed = closeSubpathContext(context);

  expect(closed).toBe(context);
  expect(closed.graphicsStateStack).toBe(context.graphicsStateStack);
});

test("入力 context の currentPath を mutate しない", () => {
  const context = buildContextWithSegments([PathSegment.moveTo(0, 0)]);
  const beforePath = GraphicsStateStack.current(
    context.graphicsStateStack,
  ).currentPath;

  const closed = closeSubpathContext(context);

  expect(beforePath.segments).toEqual([PathSegment.moveTo(0, 0)]);
  expect(closed.graphicsStateStack).not.toBe(context.graphicsStateStack);
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

  const closed = closeSubpathContext(context);

  const restored = GraphicsStateStack.restore(closed.graphicsStateStack);

  expect(GraphicsStateStack.current(restored.stack)).toEqual(savedState);
});
