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
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { strokeHandler } from "../index";

const real = (value: number): PdfObject => ({ type: "real", value });

const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
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
  return { operandStack, graphicsStateStack };
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
  return { operandStack, graphicsStateStack };
};

test("空 path に対して `S` は no-op で segments が空のまま保たれる", () => {
  const ctx = buildContext([]);

  const result = strokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("空 path に対する `S` の後、後続 `l` / `c` が依拠する CurrentPath.isEmpty 不変条件は保たれる", () => {
  const ctx = buildContext([]);

  const result = strokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("`m(0,0)` 済み path に `S` を実行すると segments が空になる", () => {
  const ctx = buildContextWithSegments([PathSegment.moveTo(0, 0)]);

  const result = strokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("`m(0,0) → l(100,200)` 済み path に `S` を実行すると segments が空になる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
  ]);

  const result = strokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("`m → l → close` 済み path に `S` を実行すると segments が空になる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
    PathSegment.close(),
  ]);

  const result = strokeHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("operand stack が空でも `S` は成功する", () => {
  const ctx = buildContext([]);

  const result = strokeHandler(ctx);

  assert(result.ok);
});

test("operand stack に numeric 値があっても `S` は pop しない (depth / peek 維持)", () => {
  const ctx = buildContext([real(1), real(2), real(3)]);
  const depthBefore = OperandStack.depth(ctx.operandStack);
  const peekBefore = OperandStack.peek(ctx.operandStack);

  const result = strokeHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  expect(OperandStack.depth(result.value.operandStack)).toBe(3);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(3));
  expect(peekAfter.value).toEqual(peekBefore.value);
});

test("operand stack に非 numeric 値があっても `S` は成功し、depth / peek を維持する", () => {
  const name: PdfObject = { type: "name", value: "Foo" };
  const bool: PdfObject = { type: "boolean", value: true };
  const dict: PdfObject = { type: "dictionary", entries: new Map() };
  const ctx = buildContext([name, bool, dict]);
  const depthBefore = OperandStack.depth(ctx.operandStack);
  const peekBefore = OperandStack.peek(ctx.operandStack);

  const result = strokeHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  expect(OperandStack.depth(result.value.operandStack)).toBe(3);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(dict);
  expect(peekAfter.value).toEqual(peekBefore.value);
});

test("非空 path + 非デフォルト ctm / lineWidth / lineCap / lineJoin / miterLimit で `S` 実行しても currentPath 以外が保持される", () => {
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

  const result = strokeHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.currentPath.segments).toEqual([]);
  expect(after.ctm).toEqual(seededCtm);
  expect(after.lineWidth).toBe(5);
  expect(after.lineCap).toBe(seededLineCap);
  expect(after.lineJoin).toBe(seededLineJoin);
  expect(after.miterLimit).toBe(20);
});

test("`m → l` 済み path に対する連続 `S → S` で 2 回目も成功し currentPath が空のまま保たれる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
  ]);

  const firstResult = strokeHandler(ctx);
  assert(firstResult.ok);
  const secondResult = strokeHandler(firstResult.value);

  assert(secondResult.ok);
  const current = GraphicsStateStack.current(
    secondResult.value.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([]);
});

test("成功時 `result.value.operandStack` は入力 `ctx.operandStack` と同一参照 (reset 分岐)", () => {
  const ctx = buildContextWithSegments([PathSegment.moveTo(0, 0)], [real(1)]);

  const result = strokeHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});
