import { assert, expect, test } from "vitest";
import type { PdfObject } from "../../../../../pdf/types/pdf-types/index";
import {
  Color,
  ColorSpace,
  CurrentPath,
  GraphicsState,
  GraphicsStateStack,
  LineCap,
  LineJoin,
  Matrix,
} from "../../../../graphics-state/index";
import { PathSegment } from "../../../../graphics-state/path-segment/index";
import { OperandStack } from "../../../../operand-stack/index";
import type { OperatorHandlerContext } from "../../../../operator-registry/index";
import { KHandler } from "../stroke";

// 入力配列は push 順 = content stream 出現順 (c, m, y, k)。
// pop は LIFO なので handler 内では k, y, m, c の順で取り出される。
const buildContext = (operands: PdfObject[]): OperatorHandlerContext => {
  const operandStack = OperandStack.create();
  for (const operand of operands) {
    OperandStack.push(operandStack, operand);
  }
  const graphicsStateStack = GraphicsStateStack.create();
  return { operandStack, graphicsStateStack };
};

const real = (value: number): PdfObject => ({ type: "real", value });
const int = (value: number): PdfObject => ({ type: "integer", value });

test("`1 0 0 0 K` で strokeColor=Color.cmyk(1, 0, 0, 0) / strokeColorSpace=deviceCMYK() になる", () => {
  const ctx = buildContext([real(1), real(0), real(0), real(0)]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.cmyk(1, 0, 0, 0));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceCMYK());
});

test.each([
  { label: "0.2 0.4 0.6 0.8", c: 0.2, m: 0.4, y: 0.6, k: 0.8 },
  { label: "all zero", c: 0, m: 0, y: 0, k: 0 },
  { label: "all one", c: 1, m: 1, y: 1, k: 1 },
])("値 $label が Color.cmyk にそのまま反映される", ({ c, m, y, k }) => {
  const ctx = buildContext([real(c), real(m), real(y), real(k)]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.cmyk(c, m, y, k));
  expect(current.strokeColorSpace).toEqual(ColorSpace.deviceCMYK());
});

test("integer/real 混在 operand でも Color.cmyk が正しく組み立てられる", () => {
  const ctx = buildContext([int(0), real(0.5), int(1), real(0.25)]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.cmyk(0, 0.5, 1, 0.25));
});

test("初期 fillColor=rgb(0.7, 0.8, 0.9) を seed しても K 実行後 fill 系は完全一致で保持される", () => {
  const operandStack = OperandStack.create();
  OperandStack.push(operandStack, real(0.2));
  OperandStack.push(operandStack, real(0.4));
  OperandStack.push(operandStack, real(0.6));
  OperandStack.push(operandStack, real(0.8));
  const baseStack = GraphicsStateStack.create();
  const base = GraphicsStateStack.current(baseStack);
  const seeded = GraphicsState.update(base, {
    fillColor: Color.rgb(0.7, 0.8, 0.9),
    fillColorSpace: ColorSpace.deviceRGB(),
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    baseStack,
    seeded,
  );

  const result = KHandler({ operandStack, graphicsStateStack });

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.fillColor).toEqual(Color.rgb(0.7, 0.8, 0.9));
  expect(current.fillColorSpace).toEqual(ColorSpace.deviceRGB());
  expect(current.strokeColor).toEqual(Color.cmyk(0.2, 0.4, 0.6, 0.8));
});

test("成功時 pop で operand stack が空になる (depth 0)", () => {
  const ctx = buildContext([real(0.2), real(0.4), real(0.6), real(0.8)]);

  const result = KHandler(ctx);

  assert(result.ok);
  expect(OperandStack.depth(result.value.operandStack)).toBe(0);
});

test("operand stack に余剰要素 (5 個) がある場合、末尾 4 個だけ pop し残り 1 個 (42) は保持", () => {
  const extra = int(42);
  const ctx = buildContext([extra, real(0.2), real(0.4), real(0.6), real(0.8)]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.cmyk(0.2, 0.4, 0.6, 0.8));
  expect(OperandStack.depth(result.value.operandStack)).toBe(1);
  const top = OperandStack.peek(result.value.operandStack);
  assert(top.some);
  expect(top.value).toEqual(extra);
});

test("成功時 result.value.operandStack は context.operandStack と同一参照", () => {
  const ctx = buildContext([real(0.2), real(0.4), real(0.6), real(0.8)]);

  const result = KHandler(ctx);

  assert(result.ok);
  expect(result.value.operandStack).toBe(ctx.operandStack);
});

test("成功時 fillColor / fillColorSpace は不変", () => {
  const ctx = buildContext([real(0.2), real(0.4), real(0.6), real(0.8)]);
  const before = GraphicsStateStack.current(ctx.graphicsStateStack);

  const result = KHandler(ctx);

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.fillColor).toEqual(before.fillColor);
  expect(after.fillColorSpace).toEqual(before.fillColorSpace);
});

test("成功時 非デフォルトの ctm / lineWidth / lineCap / lineJoin / miterLimit / currentPath を seed しても全て不変", () => {
  const operandStack = OperandStack.create();
  OperandStack.push(operandStack, real(0.2));
  OperandStack.push(operandStack, real(0.4));
  OperandStack.push(operandStack, real(0.6));
  OperandStack.push(operandStack, real(0.8));

  const baseStack = GraphicsStateStack.create();
  const base = GraphicsStateStack.current(baseStack);
  const seededCtm = Matrix.create(2, 0, 0, 3, 10, 20);
  const seededPath = CurrentPath.append(
    CurrentPath.append(CurrentPath.empty(), PathSegment.moveTo(1, 2)),
    PathSegment.lineTo(3, 4),
  );
  const seeded = GraphicsState.update(base, {
    ctm: seededCtm,
    lineWidth: 2.5,
    lineCap: LineCap.create(1),
    lineJoin: LineJoin.create(2),
    miterLimit: 4,
    currentPath: seededPath,
  });
  const graphicsStateStack = GraphicsStateStack.replaceCurrent(
    baseStack,
    seeded,
  );

  const result = KHandler({ operandStack, graphicsStateStack });

  assert(result.ok);
  const after = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(after.ctm).toEqual(seededCtm);
  expect(after.lineWidth).toBe(2.5);
  expect(after.lineCap).toBe(LineCap.create(1));
  expect(after.lineJoin).toBe(LineJoin.create(2));
  expect(after.miterLimit).toBe(4);
  expect(after.currentPath).toEqual(seededPath);
  expect(after.strokeColor).toEqual(Color.cmyk(0.2, 0.4, 0.6, 0.8));
});

test.each([
  { label: "negative c", c: -0.1, m: 0, y: 0, k: 0 },
  { label: "negative k", c: 0, m: 0, y: 0, k: -1 },
  { label: "c > 1", c: 1.5, m: 0, y: 0, k: 0 },
  { label: "k > 1", c: 0, m: 0, y: 0, k: 2 },
])("境界値 $label は検証せず Color.cmyk にそのまま透過する", ({
  c,
  m,
  y,
  k,
}) => {
  const ctx = buildContext([real(c), real(m), real(y), real(k)]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  expect(current.strokeColor).toEqual(Color.cmyk(c, m, y, k));
});

test("NaN operand を渡しても handler はエラーを返さず Color.cmyk の各成分が NaN になる", () => {
  const ctx = buildContext([
    real(Number.NaN),
    real(Number.NaN),
    real(Number.NaN),
    real(Number.NaN),
  ]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.strokeColor.kind === "cmyk");
  expect(Number.isNaN(current.strokeColor.c)).toBe(true);
  expect(Number.isNaN(current.strokeColor.m)).toBe(true);
  expect(Number.isNaN(current.strokeColor.y)).toBe(true);
  expect(Number.isNaN(current.strokeColor.k)).toBe(true);
});

test("+Infinity / -Infinity operand を渡しても handler はエラーを返さず Color.cmyk にそのまま透過する", () => {
  const ctx = buildContext([
    real(Number.POSITIVE_INFINITY),
    real(Number.NEGATIVE_INFINITY),
    real(Number.POSITIVE_INFINITY),
    real(Number.NEGATIVE_INFINITY),
  ]);

  const result = KHandler(ctx);

  assert(result.ok);
  const current = GraphicsStateStack.current(result.value.graphicsStateStack);
  assert(current.strokeColor.kind === "cmyk");
  expect(current.strokeColor.c).toBe(Number.POSITIVE_INFINITY);
  expect(current.strokeColor.m).toBe(Number.NEGATIVE_INFINITY);
  expect(current.strokeColor.y).toBe(Number.POSITIVE_INFINITY);
  expect(current.strokeColor.k).toBe(Number.NEGATIVE_INFINITY);
});
