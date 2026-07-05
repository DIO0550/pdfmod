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
import { hHandler } from "../index";

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

test("空 path に対して `h` は no-op で segments が空のまま保たれる", () => {
  const ctx = buildContext([]);

  const result = hHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([]);
});

test("空 path に対する `h` の後、後続 `l` / `c` が依拠する CurrentPath.isEmpty 不変条件は保たれる", () => {
  const ctx = buildContext([]);

  const result = hHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(CurrentPath.isEmpty(current.currentPath)).toBe(true);
});

test("`m(0,0)` 済み path に `h` を実行すると segments が [moveTo(0,0), close] になる", () => {
  const ctx = buildContextWithSegments([PathSegment.moveTo(0, 0)]);

  const result = hHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.close(),
  ]);
});

test("`m(0,0) → l(100,200)` 済み path に `h` を実行すると segments が [moveTo, lineTo, close] になる", () => {
  const ctx = buildContextWithSegments([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
  ]);

  const result = hHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.lineTo(100, 200),
    PathSegment.close(),
  ]);
});

test("operand stack が空でも `h` は成功する", () => {
  const ctx = buildContext([]);

  const result = hHandler(ctx);

  assert(result.ok);
});

test("operand stack に numeric 値があっても `h` は pop しない (depth / peek 維持)", () => {
  const ctx = buildContext([real(1), real(2), real(3)]);
  const depthBefore = OperandStack.depth(ctx.operandStack);
  const peekBefore = OperandStack.peek(ctx.operandStack);

  const result = hHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  expect(OperandStack.depth(result.value.operandStack)).toBe(3);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(real(3));
  expect(peekAfter.value).toEqual(peekBefore.value);
});

test("operand stack に非 numeric 値があっても `h` は成功し、depth / peek を維持する", () => {
  const name: PdfObject = { type: "name", value: "Foo" };
  const bool: PdfObject = { type: "boolean", value: true };
  const dict: PdfObject = { type: "dictionary", entries: new Map() };
  const ctx = buildContext([name, bool, dict]);
  const depthBefore = OperandStack.depth(ctx.operandStack);
  const peekBefore = OperandStack.peek(ctx.operandStack);

  const result = hHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(depthBefore);
  expect(OperandStack.depth(result.value.operandStack)).toBe(3);
  const peekAfter = OperandStack.peek(result.value.operandStack);
  assert(peekBefore.some);
  assert(peekAfter.some);
  expect(peekAfter.value).toEqual(dict);
  expect(peekAfter.value).toEqual(peekBefore.value);
});

test("`h` 実行で ctm / lineWidth / lineCap / lineJoin / miterLimit が変化しない", () => {
  const ctx = buildContext([]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = hHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(before.ctm);
  expect(after.lineWidth).toBe(before.lineWidth);
  expect(after.lineCap).toEqual(before.lineCap);
  expect(after.lineJoin).toEqual(before.lineJoin);
  expect(after.miterLimit).toBe(before.miterLimit);
});

test("`m(0,0)` 済み path に対する連続 `h → h` で segments が [moveTo, close, close] になる", () => {
  const ctx = buildContextWithSegments([PathSegment.moveTo(0, 0)]);

  const firstResult = hHandler(ctx);
  assert(firstResult.ok);
  const secondResult = hHandler(firstResult.value);

  assert(secondResult.ok);
  const current = GraphicsStateStack.current(
    secondResult.value.graphicsStateStack,
  );
  expect(current.currentPath.segments).toEqual([
    PathSegment.moveTo(0, 0),
    PathSegment.close(),
    PathSegment.close(),
  ]);
});

test("成功時 `result.value.operandStack` は入力 `ctx.operandStack` と同一参照", () => {
  const ctx = buildContext([real(1)]);

  const result = hHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});
