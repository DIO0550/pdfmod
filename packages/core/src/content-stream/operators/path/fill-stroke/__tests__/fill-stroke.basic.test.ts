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
import { fillStrokeHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });

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

test("空 path に対して `B` は no-op で segments が空のまま保たれる", () => {
  const ctx = buildContext([]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("空 path に対する `B` の後、後続 `l` / `c` が依拠する CurrentPath.isEmpty 不変条件は保たれる", () => {
  const ctx = buildContext([]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("`m(0,0)` 済み path に `B` を実行すると segments が空になる", () => {
  const ctx = buildContextWithSegments([PathSegment.moveTo(0, 0)]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("`m(0,0) → l(100,200)` 済み path に `B` を実行すると segments が空になる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
  ]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("`m → l → close` 済み path に `B` を実行すると segments が空になる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
    PathSegment.close(),
  ]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("operand stack が空でも `B` は成功する", () => {
  const ctx = buildContext([]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
});

test("operand stack に numeric 値があっても `B` は pop しない (depth / peek 維持)", () => {
  const ctx = buildContext([real(1), real(2), real(3)]);
  const depthBefore = OperandStack.depth(ctx.operandStack);
  const peekBefore = OperandStack.peek(ctx.operandStack);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  expect(OperandStack.depth(result.value.operandStack)).toBe(3);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(3));
  expect(peekAfter.value).toEqual(peekBefore.value);
});

test.each<{ label: string; operands: PdfObject[]; topExpected: PdfObject }>([
  {
    label: "name",
    operands: [{ type: "name", value: "Foo" }],
    topExpected: { type: "name", value: "Foo" },
  },
  {
    label: "boolean",
    operands: [{ type: "boolean", value: true }],
    topExpected: { type: "boolean", value: true },
  },
  {
    label: "dictionary",
    operands: [{ type: "dictionary", entries: new Map() }],
    topExpected: { type: "dictionary", entries: new Map() },
  },
])("operand stack に非 numeric 値 ($label) があっても `B` は成功し depth / peek を維持する", ({
  operands,
  topExpected,
}) => {
  const ctx = buildContext(operands);
  const depthBefore = OperandStack.depth(ctx.operandStack);
  const peekBefore = OperandStack.peek(ctx.operandStack);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(topExpected);
  expect(peekAfter.value).toEqual(peekBefore.value);
});

test("非空 path + 非デフォルト ctm / lineWidth / lineCap / lineJoin / miterLimit で `B` 実行しても currentPath 以外が保持される", () => {
  const baseState = GraphicsState.create();
  let path = baseState.currentPath;
  path = CurrentPath.append(path, PathSegment.moveTo(0, 0));
  path = CurrentPath.append(path, PathSegment.lineTo(100, 200));
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
  const ctx = buildContextWithGraphicsState(seededState);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([]);
  expect(after.ctm).toBe(seededCtm);
  expect(after.lineWidth).toBe(5);
  expect(after.lineCap).toBe(seededLineCap);
  expect(after.lineJoin).toBe(seededLineJoin);
  expect(after.miterLimit).toBe(20);
});

test("`m → l` 済み path に対する連続 `B → B` で 2 回目も成功し currentPath が空のまま保たれる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
  ]);

  const firstResult = fillStrokeHandler(ctx);
  assert(firstResult.ok);
  const secondResult = fillStrokeHandler(firstResult.value);

  assert(secondResult.ok);
  const current = GraphicsStateStack.current(
    secondResult.value.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([]);
});

test("reset 分岐: operandStack は同一参照、graphicsStateStack は別参照、入力 graphicsStateStack の currentPath は mutate されない", () => {
  const ctx = buildContextWithSegments([PathSegment.moveTo(0, 0)], [real(1)]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
  expect(result.value.graphicsStateStack).not.toBe(ctx.graphicsStateStack);
  expect(
    GraphicsStateStack.current(ctx.graphicsStateStack).currentPath.segments,
  ).toEqual([PathSegment.moveTo(0, 0)]);
});

test("空 path 早期 return 分岐で `result.value.operandStack` / `graphicsStateStack` は入力と同一参照", () => {
  const ctx = buildContext([real(1)]);

  const result = fillStrokeHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
  expect(result.value.graphicsStateStack).toBe(ctx.graphicsStateStack);
});

test("`q` 済み (saved state あり) 状態で `B` を実行しても saved stack が保持される", () => {
  const baseState = GraphicsState.create();
  const savedCtm = Matrix.create(2, 0, 0, 3, 10, 20);
  const savedPath = CurrentPath.append(
    baseState.currentPath,
    PathSegment.moveTo(0, 0),
  );
  const savedState = GraphicsState.update(baseState, {
    currentPath: savedPath,
    ctm: savedCtm,
    lineWidth: 5,
  });
  const stackWithSavedCurrent = GraphicsStateStack.replaceCurrent(
    GraphicsStateStack.create(),
    savedState,
  );
  const savedStack = GraphicsStateStack.save(stackWithSavedCurrent);

  let currentPath = baseState.currentPath;
  currentPath = CurrentPath.append(currentPath, PathSegment.moveTo(50, 60));
  currentPath = CurrentPath.append(currentPath, PathSegment.lineTo(100, 200));
  const currentState = GraphicsState.update(baseState, {
    currentPath,
    lineWidth: 1,
  });
  const seededStack = GraphicsStateStack.replaceCurrent(
    savedStack,
    currentState,
  );
  const ctx: OperatorHandlerContext = {
    operandStack: OperandStack.create(),
    graphicsStateStack: seededStack,
    markedContentStack: MarkedContentStack.create(),
  };

  const result = fillStrokeHandler(ctx);

  assert(result.ok);

  const restoredAfter = GraphicsStateStack.restore(
    result.value.graphicsStateStack,
  );
  const restoredAfterCurrent = GraphicsStateStack.current(restoredAfter);
  expect(restoredAfterCurrent.lineWidth).toBe(5);
  expect(restoredAfterCurrent.ctm).toBe(savedCtm);
  expect(restoredAfterCurrent.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
  ]);

  const restoredInput = GraphicsStateStack.restore(ctx.graphicsStateStack);
  const restoredInputCurrent = GraphicsStateStack.current(restoredInput);
  expect(restoredInputCurrent.lineWidth).toBe(5);
  expect(restoredInputCurrent.ctm).toBe(savedCtm);
  expect(restoredInputCurrent.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
  ]);
});
